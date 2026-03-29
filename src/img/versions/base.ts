import type { ImgHeader, SpriteEntry } from "../types";

/**
 * 版本处理器接口
 * 每个 IMG 版本（Ver1/Ver2, Ver4 等）都有自己的处理器
 */
export interface VersionHandler {
	/** 对应的 IMG 版本 */
	readonly version: number;

	/**
	 * 计算 sprite entries 区域的起始偏移
	 * @param header IMG 文件头
	 * @param data 完整的 IMG 数据（Ver4 需要读取调色板大小）
	 * @returns sprite entries 区域的起始偏移
	 */
	getSpriteEntriesStart(header: ImgHeader, data: Buffer): number;

	/**
	 * 计算实际图像数据的起始偏移
	 * @param header IMG 文件头
	 * @param data 完整的 IMG 数据
	 * @returns 数据区域的起始偏移
	 */
	getDataStart(header: ImgHeader, data: Buffer): number;

	/**
	 * 读取调色板（如果没有调色板返回 null）
	 * @param data 完整的 IMG 数据
	 * @returns 调色板数组，每个元素是 4 字节 BGRA，或 null
	 */
	readPalette(data: Buffer): Buffer[] | null;

	/**
	 * 解码单个 sprite 数据
	 * @param sprite sprite 条目
	 * @param rawData 原始数据（已解压）
	 * @param palette 调色板（Ver4 可能需要）
	 * @returns 解码后的 ARGB_8888 数据，或 null
	 */
	decodeSprite(
		sprite: SpriteEntry,
		rawData: Buffer,
		palette: Buffer[] | null,
	): Buffer | null;
}
