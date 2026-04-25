// IMG文件标志
export const IMG_FLAG = "Neople Img File";
export const IMAGE_FLAG = "Neople Image File";

/**
 * IMG版本枚举
 * 算法来源: Img_Version.cs
 */
export enum ImgVersion {
	Other = 0x00,
	Ver1 = 0x01,
	Ver2 = 0x02,
	Ver4 = 0x04,
	Ver5 = 0x05,
	Ver6 = 0x06,
	Ver7 = 0x07,
	Ver8 = 0x08,
	Ver9 = 0x09,
}

/**
 * 颜色格式枚举
 * 算法来源: Sprite.cs ColorBits
 */
export enum ColorBits {
	ARGB_1555 = 0x0e,
	ARGB_4444 = 0x0f,
	ARGB_8888 = 0x10,
	LINK = 0x11, // 链接到另一个Sprite
	DXT_1 = 0x12,
	DXT_3 = 0x13,
	DXT_5 = 0x14,
	UNKNOWN = 0x00,
}

/**
 * 压缩模式枚举
 * 算法来源: Sprite.cs CompressMode
 */
export enum CompressMode {
	NONE = 0x05,
	ZLIB = 0x06,
	DDS_ZLIB = 0x07,
	UNKNOWN = 0x01,
}

/**
 * IMG文件头
 */
export interface ImgHeader {
	flag: string; // "Neople Img File" 或 "Neople Image File"
	indexLength: number; // 索引区长度
	version: ImgVersion;
	count: number; // Sprite数量
}

/**
 * Sprite条目 (单个图片条目)
 * LINK类型只有index, type, target
 * 非LINK类型有其他所有字段
 */
export interface SpriteEntry {
	index: number; // 在ImgFile中的索引
	type: ColorBits; // 颜色格式
	/** LINK类型的目标索引 */
	target?: number;
	/** 以下是非LINK类型的字段 */
	compressMode?: CompressMode;
	width?: number;
	height?: number;
	length?: number; // 数据长度
	x?: number; // X偏移
	y?: number; // Y偏移
	frameWidth?: number;
	frameHeight?: number;
}

/**
 * Sprite 元数据，用于写入 PNG tEXt 块
 */
export interface SpriteMetadata {
	x: number;
	y: number;
	frameWidth: number;
	frameHeight: number;
	npkFile: string;
}
