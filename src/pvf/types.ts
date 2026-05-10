/**
 * PVF 文件头结构
 * 总大小: 56 字节
 */
export interface PvfHeader {
	/** 固定值 0x24 (36) */
	sizeGUID: number;
	/** GUID 数据 (36字节) */
	GUID: Uint8Array;
	/** 文件版本 */
	fileVersion: number;
	/** 目录树占用的字节数 */
	dirTreeLength: number;
	/** CRC32 校验和（目录树解密的密钥） */
	dirTreeChecksum: number;
	/** PVF 中包含的文件数量 */
	numFilesInDirTree: number;
}

/**
 * PVF 目录树中的文件条目
 */
export interface PvfFileEntry {
	/** 文件编号 */
	fileNumber: number;
	/** 文件路径长度 */
	filePathLength: number;
	/** 文件路径（已解码） */
	filePath: string;
	/** 文件实际长度 */
	fileLength: number;
	/** 文件 CRC32（文件内容解密的密钥） */
	fileCrc32: number;
	/** 相对于数据区起始的偏移 */
	relativeOffset: number;
	/** 在 PVF 文件中的绝对偏移 */
	absoluteOffset: number;
}

/**
 * PVF 字符串表上下文
 * 封装 stringtable.bin 解析结果和 n_string.lst 翻译表
 */
export interface PvfStringContext {
	binMap: string[];
	stringMap: Map<string, string>;
}
