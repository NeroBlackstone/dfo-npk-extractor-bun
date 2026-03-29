import { inflateSync } from "node:zlib";
import { decodeSpriteData } from "../decoder";
import type { ImgHeader, SpriteEntry } from "../types";
import { ColorBits, CompressMode, ImgVersion } from "../types";
import type { VersionHandler } from "./base";

/**
 * Ver4 处理器 - 处理 Ver4 格式
 * Header 32 字节 + 调色板(4 字节 + paletteColors * 4 字节)
 */
export const ver4Handler: VersionHandler = {
	version: ImgVersion.Ver4,

	getSpriteEntriesStart(_header: ImgHeader, data: Buffer): number {
		// Ver4: 32 字节头 + 调色板
		// 调色板结构: 4 字节 paletteColors + paletteColors * 4 字节颜色数据
		const paletteColors = data.readInt32LE(32);
		const paletteSize = 4 + paletteColors * 4;
		return 32 + paletteSize;
	},

	getDataStart(header: ImgHeader, data: Buffer): number {
		const spriteEntriesStart = this.getSpriteEntriesStart(header, data);
		return spriteEntriesStart + header.indexLength;
	},

	readPalette(data: Buffer): Buffer[] | null {
		const paletteColors = data.readInt32LE(32);
		if (paletteColors <= 0) {
			return null;
		}

		const palette: Buffer[] = [];
		// 调色板从偏移 36 开始 (32 + 4 字节 paletteColors)
		for (let i = 0; i < paletteColors; i++) {
			palette.push(data.subarray(36 + i * 4, 36 + (i + 1) * 4));
		}
		return palette;
	},

	decodeSprite(
		sprite: SpriteEntry,
		rawData: Buffer,
		palette: Buffer[] | null,
	): Buffer | null {
		// Ver4 格式: ARGB_1555 + ZLIB 压缩后的数据是调色板索引，不是标准 ARGB_1555
		// 需要特殊处理
		if (
			sprite.type === ColorBits.ARGB_1555 &&
			sprite.compressMode === CompressMode.ZLIB &&
			palette &&
			palette.length > 0
		) {
			// 解压后的数据是调色板索引 (1 byte per pixel)
			const decompressed = Buffer.from(inflateSync(new Uint8Array(rawData)));
			const pixelCount = decompressed.length;
			const result = Buffer.alloc(pixelCount * 4); // 转换为 ARGB_8888

			for (let i = 0; i < pixelCount; i++) {
				const byte = decompressed[i];
				if (byte === undefined) {
					continue;
				}
				const paletteIndex = byte % palette.length;
				const color = palette[paletteIndex];
				if (color == null || color.length < 4) {
					continue;
				}
				result[i * 4] = color[0] ?? 0;
				result[i * 4 + 1] = color[1] ?? 0;
				result[i * 4 + 2] = color[2] ?? 0;
				result[i * 4 + 3] = color[3] ?? 0;
			}
			return result;
		}

		// 其他情况使用标准解码器
		return decodeSpriteData(rawData, sprite);
	},
};
