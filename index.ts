import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { readNpkFile } from "./src/npk/index";

// CRC32 table for PNG
const CRC32_TABLE: number[] = [];
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	CRC32_TABLE[i] = c >>> 0;
}

/**
 * 将路径转换为目录结构
 * album path: sprite/monster/screamingcave/apopis/(tn)apopis.img
 * + sprite index 0
 * -> sprite/monster/screamingcave/apopis/(tn)apopis.img/0.png
 */
function pathToDirStructure(
	albumPath: string,
	spriteIndex: number,
	baseDir: string,
): string {
	// albumPath 已经是 / 分隔的路径
	// 直接以 albumPath 作为目录，spriteIndex 作为文件名
	return `${baseDir}/${albumPath}/${spriteIndex}.png`;
}

function extractSpritesFromNpk(npkPath: string, outputBase: string) {
	const albums = readNpkFile(npkPath);
	console.log(`[${npkPath}] Found ${albums.length} albums`);

	let savedCount = 0;

	for (const album of albums) {
		const sprites = album.getSprites();

		for (let i = 0; i < sprites.length; i++) {
			const sprite = sprites[i];
			if (!sprite) continue;

			// Skip LINK type
			if (sprite.type === 0x11) {
				continue;
			}

			const decodedData = album.decodeSpriteData(i);
			if (!decodedData) {
				continue;
			}

			const width = sprite.width;
			const height = sprite.height;
			if (!width || !height) {
				continue;
			}

			// 转换路径
			const relativePath = pathToDirStructure(album.path, i, outputBase);

			// 确保目录存在
			const dirPath = relativePath.substring(0, relativePath.lastIndexOf("/"));
			if (!existsSync(dirPath)) {
				mkdirSync(dirPath, { recursive: true });
			}

			try {
				const png = createPng(decodedData, width, height);
				writeFileSync(relativePath, png);
				savedCount++;
			} catch (e) {
				console.log(`  Sprite ${i}: PNG save error: ${e}`);
			}
		}
	}

	return savedCount;
}

// 扫描工作目录下的所有 .npk 文件
const WORK_DIR = ".";
const OUTPUT_BASE = ".";

const files = readdirSync(WORK_DIR);
const npkFiles = files.filter((f) => f.toLowerCase().endsWith(".npk"));

if (npkFiles.length === 0) {
	console.log("No .npk files found in working directory");
	process.exit(0);
}

console.log(`Found ${npkFiles.length} NPK file(s)\n`);

let totalSaved = 0;
for (const npkFile of npkFiles) {
	totalSaved += extractSpritesFromNpk(npkFile, OUTPUT_BASE);
}

console.log(`\nDone! Saved ${totalSaved} sprites`);

function createPng(data: Buffer, width: number, height: number): Buffer {
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

	return Buffer.concat([
		signature,
		makeChunk("IHDR", ihdrData),
		makeChunk("IDAT", compressed),
		makeChunk("IEND", Buffer.alloc(0)),
	]);
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
		crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}
