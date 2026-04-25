import { deflateSync } from "node:zlib";
import type { SpriteMetadata } from "./types";

// CRC32 table for PNG
const CRC32_TABLE: number[] = [];
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	CRC32_TABLE[i] = c >>> 0;
}

/**
 * 创建 PNG 图片
 * @param data BGRA 格式的像素数据
 * @param width 图片宽度
 * @param height 图片高度
 * @param metadata 可选的 Sprite 元数据，会写入 tEXt 块
 */
export function createPng(
	data: Buffer,
	width: number,
	height: number,
	metadata?: SpriteMetadata,
): Buffer {
	const signature = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);

	// IHDR
	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(width, 0);
	ihdrData.writeUInt32BE(height, 4);
	ihdrData.writeUInt8(8, 8);
	ihdrData.writeUInt8(6, 9); // RGBA
	ihdrData.writeUInt8(0, 10);
	ihdrData.writeUInt8(0, 11);
	ihdrData.writeUInt8(0, 12);

	// Build raw RGBA data with filter bytes
	const raw = Buffer.alloc(height * (1 + width * 4));
	for (let y = 0; y < height; y++) {
		raw[y * (1 + width * 4)] = 0; // filter None
		for (let x = 0; x < width; x++) {
			const srcIdx = (y * width + x) * 4;
			const dstIdx = y * (1 + width * 4) + 1 + x * 4;
			// BGRA -> RGBA for PNG
			raw[dstIdx] = data[srcIdx + 2] ?? 0; // R
			raw[dstIdx + 1] = data[srcIdx + 1] ?? 0; // G
			raw[dstIdx + 2] = data[srcIdx] ?? 0; // B
			raw[dstIdx + 3] = data[srcIdx + 3] ?? 0; // A
		}
	}

	// Compress
	const compressed = deflateSync(raw, { level: 9 });

	const textChunks = buildMetadataChunks(metadata);

	return Buffer.concat([
		signature,
		makeChunk("IHDR", ihdrData),
		...textChunks,
		makeChunk("IDAT", compressed),
		makeChunk("IEND", Buffer.alloc(0)),
	]);
}

function makeTextChunk(keyword: string, value: string): Buffer {
	const textData = Buffer.concat([
		Buffer.from(keyword, "latin1"),
		Buffer.from([0]),
		Buffer.from(value, "latin1"),
	]);
	return makeChunk("tEXt", textData);
}

function buildMetadataChunks(metadata?: SpriteMetadata): Buffer[] {
	if (!metadata) return [];
	const fields: [string, number][] = [
		["SpriteX", metadata.x],
		["SpriteY", metadata.y],
		["SpriteWidth", metadata.width],
		["SpriteHeight", metadata.height],
		["SpriteFrameWidth", metadata.frameWidth],
		["SpriteFrameHeight", metadata.frameHeight],
	];
	return fields.map(([keyword, value]) =>
		makeTextChunk(keyword, String(value)),
	);
}

function makeChunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const typeB = Buffer.from(type, "ascii");
	const crc = crc32(Buffer.concat([typeB, data]));
	const crcB = Buffer.alloc(4);
	crcB.writeUInt32BE(crc, 0);
	return Buffer.concat([len, typeB, data, crcB]);
}

function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		const byte = data[i];
		if (byte === undefined) continue;
		crc = ((CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)) >>> 0;
	}
	return (crc ^ 0xffffffff) >>> 0;
}
