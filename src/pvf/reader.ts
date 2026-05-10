import { BufferReader } from "./buffer-reader";
import type { PvfFileEntry, PvfHeader } from "./types";

/** PVF 固定解密密钥 */
const PASSWORD_PVF = 0x81a79011;

/** PVF 文件头大小 (4 + 36 + 4 + 4 + 4 + 4 = 56) */
export const PVF_HEADER_SIZE = 56;

/**
 * 循环右移 (32位无符号)
 * 算法来源: PvfReader.cpp:11-13
 */
function rotateRight4(x: number, y: number): number {
	x = x >>> 0;
	return ((x >>> y) | (x << (32 - y))) >>> 0;
}

/**
 * 解密 PVF 数据块（返回新 buffer，不修改原数据）
 * 算法来源: PvfReader.cpp:151-170
 */
export function decryptPvfData(
	data: Uint8Array,
	len: number,
	crc32: number,
): Uint8Array {
	const out = new Uint8Array(data);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
	const wordCount = Math.floor(len / 4);
	const key = (PASSWORD_PVF ^ crc32) >>> 0;

	for (let i = 0; i < wordCount; i++) {
		const offset = i * 4;
		const value = view.getUint32(offset, true);
		const decrypted = rotateRight4((value ^ key) >>> 0, 6);
		view.setUint32(offset, decrypted, true);
	}

	return out;
}

/**
 * 读取 PVF 文件头
 */
export function readPvfHeader(buffer: Buffer): PvfHeader {
	const sizeGUID = buffer.readInt32LE(0);
	if (sizeGUID !== 0x24) {
		throw new Error(
			`Invalid PVF header: expected sizeGUID=0x24, got 0x${sizeGUID.toString(16)}`,
		);
	}

	return {
		sizeGUID,
		GUID: new Uint8Array(buffer.subarray(4, 4 + 0x24)),
		fileVersion: buffer.readInt32LE(40),
		dirTreeLength: buffer.readInt32LE(44),
		dirTreeChecksum: buffer.readUInt32LE(48),
		numFilesInDirTree: buffer.readInt32LE(52),
	};
}

/**
 * 解析 PVF 目录树，返回文件条目列表
 * 算法来源: PvfReader.cpp:96-137
 */
export function readPvfDirectory(
	dirTreeData: Uint8Array,
	numFiles: number,
	baseOffset: number,
): PvfFileEntry[] {
	const reader = new BufferReader(Buffer.from(dirTreeData));
	const entries: PvfFileEntry[] = [];

	for (let i = 0; i < numFiles; i++) {
		const fileNumber = reader.readUint32();
		const filePathLength = reader.readInt32();

		if (filePathLength <= 0 || filePathLength > 4096) {
			throw new Error(
				`Invalid filePathLength at entry ${i}: ${filePathLength}`,
			);
		}

		const filePath = reader
			.readAsciiString(filePathLength)
			.replace(/\0/g, "")
			.trim();

		const fileLength = reader.readInt32();
		const fileCrc32 = reader.readUint32();
		const relativeOffset = reader.readInt32();

		entries.push({
			fileNumber,
			filePathLength,
			filePath,
			fileLength,
			fileCrc32,
			relativeOffset,
			absoluteOffset: baseOffset + relativeOffset,
		});
	}

	return entries;
}

/**
 * 读取 PVF 文件，返回文件条目列表
 * getFileData 按需从磁盘读取，不持有整个文件 buffer
 */
export async function readPvf(pvfPath: string): Promise<{
	header: PvfHeader;
	entries: PvfFileEntry[];
	getFileData: (entry: PvfFileEntry) => Promise<Buffer>;
}> {
	const file = Bun.file(pvfPath);

	// 只读取 header + 目录树到内存
	const headerBuf = new Uint8Array(
		await file.slice(0, PVF_HEADER_SIZE).arrayBuffer(),
	);
	const header = readPvfHeader(Buffer.from(headerBuf));

	const dirTreeOffset = PVF_HEADER_SIZE;
	const dirTreeRaw = new Uint8Array(
		await file
			.slice(dirTreeOffset, dirTreeOffset + header.dirTreeLength)
			.arrayBuffer(),
	);
	const dirTreeData = decryptPvfData(
		dirTreeRaw,
		header.dirTreeLength,
		header.dirTreeChecksum,
	);

	// 解析目录树
	const dataBaseOffset = PVF_HEADER_SIZE + header.dirTreeLength;
	const entries = readPvfDirectory(
		dirTreeData,
		header.numFilesInDirTree,
		dataBaseOffset,
	);

	/**
	 * 按需从磁盘读取并解密指定条目的文件数据
	 * 算法来源: PvfNode.cpp:32-47
	 */
	async function getFileData(entry: PvfFileEntry): Promise<Buffer> {
		if (entry.fileLength <= 0) {
			return Buffer.alloc(0);
		}

		// 文件长度对齐到 4 字节: (fileLength + 3) & ~3
		const computedLength = (entry.fileLength + 3) & 0xfffffffc;

		const rawData = new Uint8Array(
			await file
				.slice(entry.absoluteOffset, entry.absoluteOffset + computedLength)
				.arrayBuffer(),
		);

		// 解密文件内容（返回新 buffer，不修改原数据）
		const decrypted = decryptPvfData(rawData, computedLength, entry.fileCrc32);

		// 只返回实际长度（去掉末尾补零）
		return Buffer.from(decrypted.subarray(0, entry.fileLength));
	}

	return { header, entries, getFileData };
}
