import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";

const NVP_MAGIC = "Neople Video Fil";
const HEADER_SIZE = 32;
const CLEAR_PREFIX = 1024;

export function isEncryptedAvi(path: string): boolean {
	const ext = extname(path).toLowerCase();
	if (ext !== ".avi") return false;

	try {
		const buffer = readFileSync(path);
		const magic = buffer.subarray(0, 16);
		const decoder = new TextDecoder();
		return decoder.decode(magic) === NVP_MAGIC;
	} catch {
		return false;
	}
}

export function decryptAvi(srcPath: string, dstPath: string): void {
	const buffer = readFileSync(srcPath);
	const view = new DataView(
		buffer.buffer,
		buffer.byteOffset,
		buffer.byteLength,
	);

	// 从偏移 0x18 读取输出大小 (little-endian uint32)
	const bk2Size = view.getUint32(0x18, true);
	const output = new Uint8Array(bk2Size);

	// 前 1024 字节明文复制
	const copyLen = Math.min(CLEAR_PREFIX, bk2Size);
	for (let i = 0; i < copyLen; i++) {
		output[i] = view.getUint8(HEADER_SIZE + i);
	}

	// XOR 解密: data[i+32] XOR output[i-1024]
	for (let i = CLEAR_PREFIX; i < bk2Size; i++) {
		const encryptedByte = view.getUint8(i + HEADER_SIZE);
		const prevByte = output[i - CLEAR_PREFIX];
		output[i] = encryptedByte ^ (prevByte ?? 0);
	}

	// 修补 MPEG-1 序列头中的 aspect_ratio_information
	// Neople 原始使用非标准值 14，导致播放器计算出错误的 SAR
	// 改为 1 (SAR=1:1, 正方形像素)，让像素分辨率直接作为显示分辨率
	patchMpeg1AspectRatio(output);

	// 从 RIFF 结构中正确移除 vprp chunk
	// vprp 会干扰 FFmpeg 的 SAR 计算，必须在不破坏 RIFF 结构的前提下移除
	removeVprpChunk(output);

	mkdirSync(dirname(dstPath), { recursive: true });
	writeFileSync(dstPath, output);
}

// --- MPEG-1 aspect_ratio_information patching ---

// MPEG-1 sequence header start code: 00 00 01 B3
const MPEG1_START_CODE = new Uint8Array([0x00, 0x00, 0x01, 0xb3]);

function patchMpeg1AspectRatio(data: Uint8Array): void {
	const len = data.length;
	let pos = 0;

	while (pos <= len - 8) {
		if (
			data[pos] === MPEG1_START_CODE[0] &&
			data[pos + 1] === MPEG1_START_CODE[1] &&
			data[pos + 2] === MPEG1_START_CODE[2] &&
			data[pos + 3] === MPEG1_START_CODE[3]
		) {
			// 起始码后第 7 字节: upper nibble = aspect_ratio_information (4 bits)
			//                     lower nibble = picture_rate (4 bits)
			const aspectByte = pos + 7;
			if (aspectByte < len && data[aspectByte] !== undefined) {
				data[aspectByte] = (data[aspectByte] & 0x0f) | (0x01 << 4);
			}
			pos += 12;
		} else {
			pos++;
		}
	}
}

// --- vprp chunk removal ---

function removeVprpChunk(data: Uint8Array): void {
	// vprp (Video Properties) chunk 会干扰 FFmpeg 的 SAR 计算
	// 必须从 RIFF 结构中正确移除：先调整所有父级 chunk 的 size，再移位数据
	const vprpTag = 0x70727076; // "vprp" in little-endian
	const riffTag = 0x46464952; // "RIFF"
	const listTag = 0x5453494c; // "LIST"

	for (let pos = 0; pos <= data.length - 8; pos++) {
		if (readLe32(data, pos) !== vprpTag) continue;

		const chunkSize = readLe32(data, pos + 4);
		if (chunkSize < 8 || pos + 8 + chunkSize > data.length) continue;

		const removeStart = pos;
		const removeLen = 8 + chunkSize + (chunkSize & 1); // 包含对齐填充

		// 向上遍历 RIFF 树，调整所有包含此 chunk 的父级 size
		let scanPos = 0;
		while (scanPos <= data.length - 8) {
			const tag = readLe32(data, scanPos);
			const size = readLe32(data, scanPos + 4);

			if (tag === riffTag || tag === listTag) {
				const childStart = scanPos + 8;
				const childEnd = childStart + size;

				// 此 LIST/RIFF 包含 vprp → 减去移除的大小
				if (removeStart >= childStart && removeStart < childEnd) {
					writeLe32(data, scanPos + 4, size - removeLen);
				}

				scanPos = childStart; // 进入子 chunk
			} else {
				scanPos += 8 + size + (size & 1); // 跳到下一个同级 chunk
			}
		}

		// 移位数据填补空隙
		data.copyWithin(removeStart, removeStart + removeLen);
		break;
	}
}

function readLe32(data: Uint8Array, pos: number): number {
	return (
		(data[pos] ?? 0) |
		((data[pos + 1] ?? 0) << 8) |
		((data[pos + 2] ?? 0) << 16) |
		((data[pos + 3] ?? 0) << 24)
	);
}

function writeLe32(data: Uint8Array, pos: number, value: number): void {
	data[pos] = value & 0xff;
	data[pos + 1] = (value >> 8) & 0xff;
	data[pos + 2] = (value >> 16) & 0xff;
	data[pos + 3] = (value >> 24) & 0xff;
}

export function outputName(srcPath: string): string {
	return srcPath.split("/").pop() ?? srcPath;
}
