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

	// 从第一个 MPEG-1 序列头读取宽高
	const dims = getMpeg1Dimensions(output);
	if (dims) {
		// 删除 AVI vprp chunk（会干扰 FFmpeg SAR 计算）
		removeVprpChunk(output);

		// 修补 MPEG-1 序列头中的 aspect_ratio_information
		patchMpeg1AspectRatio(output, dims.width, dims.height);
	}

	mkdirSync(dirname(dstPath), { recursive: true });
	writeFileSync(dstPath, output);
}

function getMpeg1Dimensions(
	data: Uint8Array,
): { width: number; height: number } | null {
	const len = data.length;
	for (let pos = 0; pos <= len - 12; pos++) {
		if (
			data[pos] === 0x00 &&
			data[pos + 1] === 0x00 &&
			data[pos + 2] === 0x01 &&
			data[pos + 3] === 0xb3
		) {
			const b4 = data[pos + 4] ?? 0;
			const b5 = data[pos + 5] ?? 0;
			const b6 = data[pos + 6] ?? 0;
			const width = (b4 << 4) | (b5 >> 4);
			const height = ((b5 & 0x0f) << 8) | b6;
			if (width > 0 && height > 0) {
				return { width, height };
			}
		}
	}
	return null;
}

// --- vprp chunk patching ---

function removeVprpChunk(data: Uint8Array): void {
	// vprp (Video Properties) chunk 会干扰 FFmpeg 的 SAR 计算
	// Neople 原始的 vprp FrameAspectRatio=1:1 导致 SAR 被错误计算
	// 直接删除 vprp chunk，让 FFmpeg 只依赖 MPEG-1 序列头中的 aspect_ratio_information
	for (let pos = 0; pos <= data.length - 8; pos++) {
		if (
			data[pos] !== 0x76 ||
			data[pos + 1] !== 0x70 ||
			data[pos + 2] !== 0x72 ||
			data[pos + 3] !== 0x70
		)
			continue;

		const chunkSize =
			(data[pos + 4] ?? 0) |
			((data[pos + 5] ?? 0) << 8) |
			((data[pos + 6] ?? 0) << 16) |
			((data[pos + 7] ?? 0) << 24);

		// 验证这是一个合理的 vprp chunk
		if (chunkSize < 8 || pos + 8 + chunkSize > data.length) continue;

		// 将整个 vprp chunk (tag + size + data) 清零
		for (let i = pos; i < pos + 8 + chunkSize; i++) {
			data[i] = 0;
		}
		break;
	}
}

// --- MPEG-1 aspect_ratio_information patching ---

// MPEG-1 sequence header start code: 00 00 01 B3
const MPEG1_START_CODE = new Uint8Array([0x00, 0x00, 0x01, 0xb3]);

function patchMpeg1AspectRatio(
	data: Uint8Array,
	_width: number,
	_height: number,
): void {
	const len = data.length;
	let pos = 0;

	// MPEG-1 的 aspect_ratio_information 定义的是 SAR (像素宽高比)
	// aspect=1 表示 SAR=1:1 (正方形像素)
	// Neople 原始使用非标准值 14，导致播放器计算出错误的 SAR
	// 统一改为 1，让像素分辨率直接作为显示分辨率
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
			if (aspectByte < len) {
				data[aspectByte] = ((data[aspectByte] ?? 0) & 0x0f) | (0x01 << 4); // aspect = 1 (SAR 1:1)
			}
			pos += 12;
		} else {
			pos++;
		}
	}
}

export function outputName(srcPath: string): string {
	return srcPath.split("/").pop() ?? srcPath;
}
