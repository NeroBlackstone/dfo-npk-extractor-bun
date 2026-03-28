import { inflateSync } from "node:zlib";
import type { SpriteEntry } from "./types";
import { ColorBits, CompressMode } from "./types";

/**
 * 解码 Sprite 数据
 * @param data 原始数据
 * @param sprite Sprite 条目
 * @returns 解码后的数据（ARGB 像素或解压后的 DDS 数据）
 */
export function decodeSpriteData(
	data: Buffer,
	sprite: SpriteEntry,
): Buffer | null {
	if (sprite.type === ColorBits.LINK) {
		return null;
	}

	const compressed =
		sprite.compressMode === CompressMode.ZLIB ||
		sprite.compressMode === CompressMode.DDS_ZLIB;

	let decoded: Buffer;
	if (compressed) {
		decoded = Buffer.from(inflateSync(new Uint8Array(data)));
	} else {
		decoded = data;
	}

	// DDS 类型返回解压后的 DDS 数据
	if (sprite.type >= ColorBits.DXT_1) {
		return decoded;
	}

	// ARGB_1555 (2 bytes per pixel) -> ARGB_8888 (4 bytes per pixel)
	if (sprite.type === ColorBits.ARGB_1555) {
		return decodeArgb1555(decoded);
	}

	// ARGB_4444 (2 bytes per pixel) -> ARGB_8888 (4 bytes per pixel)
	if (sprite.type === ColorBits.ARGB_4444) {
		return decodeArgb4444(decoded);
	}

	// ARGB_8888 直接返回
	return decoded;
}

/**
 * 解码 ARGB_1555 为 ARGB_8888 (BGRA 顺序)
 * 每个像素2字节 -> 4字节
 * C# Colors.ReadColor: target[offset + 0] = b, target[offset + 1] = g, target[offset + 2] = r, target[offset + 3] = a
 */
function decodeArgb1555(data: Buffer): Buffer {
	const pixelCount = data.length / 2;
	const result = Buffer.alloc(pixelCount * 4);

	for (let i = 0; i < pixelCount; i++) {
		const src = data.readUInt16LE(i * 2);
		const a = (src >> 15) & 0x01;
		const r = (src >> 10) & 0x1f;
		const g = (src >> 5) & 0x1f;
		const b = src & 0x1f;

		const dst = i * 4;
		result[dst] = Math.round((b * 255) / 31); // B
		result[dst + 1] = Math.round((g * 255) / 31); // G
		result[dst + 2] = Math.round((r * 255) / 31); // R
		result[dst + 3] = a ? 255 : 0; // A
	}

	return result;
}

/**
 * 解码 ARGB_4444 为 ARGB_8888 (BGRA 顺序)
 * 每个像素2字节 -> 4字节
 */
function decodeArgb4444(data: Buffer): Buffer {
	const pixelCount = data.length / 2;
	const result = Buffer.alloc(pixelCount * 4);

	for (let i = 0; i < pixelCount; i++) {
		const src = data.readUInt16LE(i * 2);
		const a = (src >> 12) & 0x0f;
		const r = (src >> 8) & 0x0f;
		const g = (src >> 4) & 0x0f;
		const b = src & 0x0f;

		const dst = i * 4;
		result[dst] = r * 17; // B
		result[dst + 1] = g * 17; // G
		result[dst + 2] = b * 17; // R
		result[dst + 3] = a * 17; // A
	}

	return result;
}
