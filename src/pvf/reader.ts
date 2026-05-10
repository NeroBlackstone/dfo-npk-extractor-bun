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
 * 解密 PVF 数据块
 * 算法来源: PvfReader.cpp:151-170
 * @param data 要解密的数据（会就地修改）
 * @param len 解密长度（按 4 字节分组处理）
 * @param crc32 CRC32 密钥
 */
export function decryptPvfData(
	data: Uint8Array,
	len: number,
	crc32: number,
): void {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const wordCount = Math.floor(len / 4);
	const key = (PASSWORD_PVF ^ crc32) >>> 0;

	for (let i = 0; i < wordCount; i++) {
		const offset = i * 4;
		const value = view.getUint32(offset, true);
		const decrypted = rotateRight4((value ^ key) >>> 0, 6);
		view.setUint32(offset, decrypted, true);
	}
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
 * 从字节数组读取以 null 结尾的字符串
 * 使用 latin1 编码（兼容 CP949 字节流）
 */
function readNullTerminatedString(bytes: Uint8Array): string {
	let len = bytes.length;
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] === 0) {
			len = i;
			break;
		}
	}
	// 使用 latin1 保持字节原样，避免 UTF-8 解码错误
	return Buffer.from(bytes.subarray(0, len)).toString("latin1").trim();
}

/**
 * 读取小端序 uint32
 */
function readUint32LE(data: Uint8Array, offset: number): number {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return view.getUint32(offset, true);
}

/**
 * 读取小端序 int32
 */
function readInt32LE(data: Uint8Array, offset: number): number {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return view.getInt32(offset, true);
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
	const entries: PvfFileEntry[] = [];
	let offset = 0;

	for (let i = 0; i < numFiles; i++) {
		const fileNumber = readUint32LE(dirTreeData, offset);
		const filePathLength = readInt32LE(dirTreeData, offset + 4);

		if (filePathLength <= 0 || filePathLength > 4096) {
			throw new Error(
				`Invalid filePathLength at entry ${i}: ${filePathLength}`,
			);
		}

		const pathBytes = dirTreeData.subarray(
			offset + 8,
			offset + 8 + filePathLength,
		);
		const filePath = readNullTerminatedString(pathBytes);

		const fileLength = readInt32LE(dirTreeData, offset + 8 + filePathLength);
		const fileCrc32 = readUint32LE(dirTreeData, offset + 12 + filePathLength);
		const relativeOffset = readInt32LE(
			dirTreeData,
			offset + 16 + filePathLength,
		);

		entries.push({
			fileNumber,
			filePathLength,
			filePath,
			fileLength,
			fileCrc32,
			relativeOffset,
			absoluteOffset: baseOffset + relativeOffset,
		});

		offset += filePathLength + 20;
	}

	return entries;
}

/**
 * 读取 PVF 文件，返回文件条目列表
 */
export function readPvf(buffer: Buffer): {
	header: PvfHeader;
	entries: PvfFileEntry[];
	getFileData: (entry: PvfFileEntry) => Buffer;
} {
	const header = readPvfHeader(buffer);

	// 读取并解密目录树
	const dirTreeOffset = PVF_HEADER_SIZE;
	const dirTreeData = new Uint8Array(
		buffer.subarray(dirTreeOffset, dirTreeOffset + header.dirTreeLength),
	);
	decryptPvfData(dirTreeData, header.dirTreeLength, header.dirTreeChecksum);

	// 解析目录树
	const dataBaseOffset = PVF_HEADER_SIZE + header.dirTreeLength;
	const entries = readPvfDirectory(
		dirTreeData,
		header.numFilesInDirTree,
		dataBaseOffset,
	);

	/**
	 * 获取指定条目的文件数据（自动解密）
	 * 算法来源: PvfNode.cpp:32-47
	 */
	function getFileData(entry: PvfFileEntry): Buffer {
		if (entry.fileLength <= 0) {
			return Buffer.alloc(0);
		}

		// 文件长度对齐到 4 字节: (fileLength + 3) & ~3
		const computedLength = (entry.fileLength + 3) & 0xfffffffc;

		const rawData = new Uint8Array(
			buffer.subarray(
				entry.absoluteOffset,
				entry.absoluteOffset + computedLength,
			),
		);

		// 解密文件内容
		decryptPvfData(rawData, computedLength, entry.fileCrc32);

		// 只返回实际长度（去掉末尾补零）
		return Buffer.from(rawData.subarray(0, entry.fileLength));
	}

	return { header, entries, getFileData };
}
