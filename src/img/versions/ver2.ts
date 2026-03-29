import { decodeSpriteData } from "../decoder";
import type { ImgHeader, SpriteEntry } from "../types";
import { IMAGE_FLAG, ImgVersion } from "../types";
import type { VersionHandler } from "./base";

/**
 * Ver2 处理器 - 处理 Ver1 和 Ver2 格式
 * Ver1: IMAGE_FLAG, Header 30 字节, 无调色板
 * Ver2: IMG_FLAG, Header 32 字节, 无调色板
 */
export const ver2Handler: VersionHandler = {
	version: ImgVersion.Ver2,

	getSpriteEntriesStart(header: ImgHeader, _data: Buffer): number {
		// Ver1 (IMAGE_FLAG): 30 字节
		// Ver2 (其他): 32 字节
		return header.flag === IMAGE_FLAG ? 30 : 32;
	},

	getDataStart(header: ImgHeader, data: Buffer): number {
		const spriteEntriesStart = this.getSpriteEntriesStart(header, data);
		return spriteEntriesStart + header.indexLength;
	},

	readPalette(_data: Buffer): Buffer[] | null {
		// Ver1/Ver2 无调色板
		return null;
	},

	decodeSprite(
		sprite: SpriteEntry,
		rawData: Buffer,
		_palette: Buffer[] | null,
	): Buffer | null {
		// 直接使用标准解码器
		return decodeSpriteData(rawData, sprite);
	},
};
