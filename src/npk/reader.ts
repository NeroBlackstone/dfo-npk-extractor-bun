import type { NpkAlbum } from "../types/npk";
import { NPK_FLAG } from "../types/npk";
import { decryptPath, generateKey } from "../utils/crypto";

/** 目录区每个Entry的字节大小 */
const ENTRY_SIZE = 264;

/**
 * 读取NPK文件头部和目录区
 * 算法来源: NpkCoder.cs:119-134 (ReadInfo) 和 NpkCoder.cs:142-164 (ReadNpk)
 */
export function readNpkHeader(buffer: Buffer): NpkAlbum[] {
	// 1. 验证NPK标志 (16字节)
	const flag = buffer.subarray(0, 16).toString("ascii").replace(/\0/g, "");
	if (flag !== NPK_FLAG) {
		throw new Error(`Invalid NPK file: expected "${NPK_FLAG}", got "${flag}"`);
	}

	// 2. 读取IMG数量 (4字节)
	const albumCount = buffer.readInt32LE(16);

	// 3. 解密路径
	const key = generateKey();

	// 4. 读取目录区
	const albums: NpkAlbum[] = [];
	for (let i = 0; i < albumCount; i++) {
		const base = 20 + i * ENTRY_SIZE;
		const offset = buffer.readInt32LE(base);
		const length = buffer.readInt32LE(base + 4);
		const path = decryptPath(new Uint8Array(buffer.subarray(base + 8, base + 264)), key);
		albums.push({ offset, length, path });
	}

	return albums;
}

