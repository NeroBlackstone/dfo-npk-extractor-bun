import { readFileSync } from "node:fs";
import { decryptPath, generateKey } from "../utils/crypto";
import { NpkAlbum } from "./album";

/**
 * 从文件路径读取NPK
 */
export function readNpkFile(path: string): NpkAlbum[] {
	const buffer = readFileSync(path);
	return readNpk(buffer);
}

/**
 * 读取NPK文件头部和目录区
 * 算法来源: NpkCoder.cs:119-134 (ReadInfo) 和 NpkCoder.cs:142-164 (ReadNpk)
 */
export function readNpk(buffer: Buffer): NpkAlbum[] {
	// 1. 验证NPK标志 (16字节)
	const flag = buffer.subarray(0, 16).toString("ascii").replace(/\0/g, "");
	const NPK_FLAG = "NeoplePack_Bill";
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
		/** 目录区每个Entry的字节大小 */
		const ENTRY_SIZE = 264;
		const base = 20 + i * ENTRY_SIZE;
		const offset = buffer.readInt32LE(base);
		const length = buffer.readInt32LE(base + 4);
		const path = decryptPath(
			new Uint8Array(buffer.subarray(base + 8, base + 264)),
			key,
		);

		// 切片出该Album的数据
		const data = buffer.subarray(offset, offset + length);
		albums.push(new NpkAlbum(offset, length, path, data));
	}

	return albums;
}
