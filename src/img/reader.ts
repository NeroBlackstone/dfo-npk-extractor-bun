import type { CompressMode, ImgHeader, SpriteEntry } from "./types";
import { ColorBits, IMAGE_FLAG, IMG_FLAG, ImgVersion } from "./types";

/**
 * 读取IMG文件头
 * 算法来源: NpkCoder.cs:170-194 (ReadImg)
 *
 * 标准IMG Header (32字节):
 * - flag: 16字节字符串 "Neople Img File" 或 "Neople Image File"
 * - indexLength: 8字节 int64
 * - version: 4字节 int32
 * - count: 4字节 int32
 */
export function readImgHeader(buffer: Buffer): ImgHeader {
	// 读取flag (16字节)
	const flagBuffer = buffer.subarray(0, 16);
	const flag = flagBuffer.toString("ascii").replace(/\0/g, "");

	// 检查是否是有效的IMG标志
	if (flag !== IMG_FLAG && flag !== IMAGE_FLAG) {
		throw new Error(
			`Invalid IMG file: expected "${IMG_FLAG}" or "${IMAGE_FLAG}", got "${flag}"`,
		);
	}

	// 如果是IMAGE_FLAG，设置版本为Ver1
	const version =
		flag === IMAGE_FLAG ? ImgVersion.Ver1 : buffer.readInt32LE(16 + 8); // indexLength之后是version

	return {
		flag,
		indexLength: Number(buffer.readBigInt64LE(16)),
		version,
		count: buffer.readInt32LE(16 + 8 + 4),
	};
}

/**
 * 读取所有Sprite条目
 * 算法来源: SecondHandler.cs:78-124 (CreateFromStream)
 *
 * 每个Sprite Entry:
 * - LINK类型: 2个int (8字节) - type和target index
 * - 非LINK类型: 9个int (36字节)
 *
 * @param buffer IMG数据缓冲区
 * @param header IMG文件头
 * @param spriteEntriesStart sprite条目区域的起始偏移（默认32，Ver4需要加上调色板偏移）
 */
export function readSpriteEntries(
	buffer: Buffer,
	header: ImgHeader,
	spriteEntriesStart: number = 32,
): SpriteEntry[] {
	const sprites: SpriteEntry[] = [];
	let offset = spriteEntriesStart;

	for (let i = 0; i < header.count; i++) {
		const base = offset;
		const type = buffer.readInt32LE(base) as ColorBits;

		if (type === ColorBits.LINK) {
			// LINK类型: 只有type和target index (8字节)
			const target = buffer.readInt32LE(base + 4);
			sprites.push({
				index: i,
				type,
				target,
			});
			offset += 8;
		} else {
			// 非LINK类型: 9个int (36字节)
			const compressMode = buffer.readInt32LE(base + 4) as CompressMode;
			const width = buffer.readInt32LE(base + 8);
			const height = buffer.readInt32LE(base + 12);
			const length = buffer.readInt32LE(base + 16);
			const x = buffer.readInt32LE(base + 20);
			const y = buffer.readInt32LE(base + 24);
			const frameWidth = buffer.readInt32LE(base + 28);
			const frameHeight = buffer.readInt32LE(base + 32);

			sprites.push({
				index: i,
				type,
				compressMode,
				width,
				height,
				length,
				x,
				y,
				frameWidth,
				frameHeight,
			});
			offset += 36;
		}
	}

	return sprites;
}
