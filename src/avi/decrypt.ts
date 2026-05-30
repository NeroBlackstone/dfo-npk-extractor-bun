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

	mkdirSync(dirname(dstPath), { recursive: true });
	writeFileSync(dstPath, output);
}

export function outputName(srcPath: string): string {
	return srcPath.split("/").pop() ?? srcPath;
}
