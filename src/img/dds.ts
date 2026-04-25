/**
 * DDS 解码器 - DXT1/DXT3/DXT5 块解压
 */

const DDS_MAGIC = 0x20534444; // "DDS " in little-endian
const DXT1 = 0x31545844; // "DXT1" in little-endian
const DXT3 = 0x33545844; // "DXT3" in little-endian
const DXT5 = 0x35545844; // "DXT5" in little-endian

export interface DdsMipmap {
	width: number;
	height: number;
	data: Buffer; // ARGB pixels
}

export interface DdsTexture {
	width: number;
	height: number;
	format: DdsFormat;
	mipmaps: DdsMipmap[];
}

export enum DdsFormat {
	RgbS3TcDxt1Format = 0x01,
	RgbaS3TcDxt3Format = 0x02,
	RgbaS3TcDxt5Format = 0x03,
}

/**
 * 解码 DDS 数据
 */
export function decodeDds(data: Buffer): DdsTexture {
	// 验证 magic number
	const magic = data.readUInt32LE(0);
	if (magic !== DDS_MAGIC) {
		throw new Error(
			`Invalid DDS magic: expected 0x${DDS_MAGIC.toString(16)}, got 0x${magic.toString(16)}`,
		);
	}

	// 解析 header
	// Offset 4: dwFlags (4 bytes)
	// Offset 8: dwHeight (4 bytes)
	// Offset 12: dwWidth (4 bytes)
	// Offset 76: dwPFFlags (4 bytes)
	// Offset 80: dwFourCC (4 bytes)
	const height = data.readUInt32LE(12);
	const width = data.readUInt32LE(16);
	const _pfFlags = data.readUInt32LE(80);
	const fourCC = data.readUInt32LE(84);

	let format: DdsFormat;

	switch (fourCC) {
		case DXT1:
			format = DdsFormat.RgbS3TcDxt1Format;
			break;
		case DXT3:
			format = DdsFormat.RgbaS3TcDxt3Format;
			break;
		case DXT5:
			format = DdsFormat.RgbaS3TcDxt5Format;
			break;
		default:
			throw new Error(`Unknown DDS format: 0x${fourCC.toString(16)}`);
	}

	// DDS 头是 128 字节，数据从偏移 128 开始
	const imageData = data.subarray(128);

	switch (format) {
		case DdsFormat.RgbS3TcDxt1Format:
			return decodeDxt1(imageData, width, height);
		case DdsFormat.RgbaS3TcDxt3Format:
			return decodeDxt3(imageData, width, height);
		case DdsFormat.RgbaS3TcDxt5Format:
			return decodeDxt5(imageData, width, height);
	}
}

/**
 * 解码 DXT1 块
 */
function decodeDxt1(data: Buffer, width: number, height: number): DdsTexture {
	const pixels = Buffer.alloc(width * height * 4);
	let offset = 0;

	for (let y = 0; y < height; y += 4) {
		for (let x = 0; x < width; x += 4) {
			// 读取颜色端点 (RGB565)
			const c0 = data.readUInt16LE(offset);
			const c1 = data.readUInt16LE(offset + 2);
			offset += 4;

			// 解码 RGB565
			const color0 = decodeRgb565(c0);
			const color1 = decodeRgb565(c1);

			// 计算 4 个颜色
			const colors: [number, number, number, number][] = [
				color0,
				color1,
				[
					Math.round((color0[0] * 2 + color1[0]) / 3),
					Math.round((color0[1] * 2 + color1[1]) / 3),
					Math.round((color0[2] * 2 + color1[2]) / 3),
					0xff,
				],
				[
					Math.round((color0[0] + color1[0] * 2) / 3),
					Math.round((color0[1] + color1[1] * 2) / 3),
					Math.round((color0[2] + color1[2] * 2) / 3),
					0xff,
				],
			];

			// 读取索引 (32 bits for 16 pixels)
			const index = data.readUInt32LE(offset);
			offset += 4;

			// 解码每个像素
			for (let i = 0; i < 16; i++) {
				const idx = (index >> (i * 2)) & 0x3;
				const px = x + (i % 4);
				const py = y + Math.floor(i / 4);

				if (px < width && py < height) {
					const pos = (py * width + px) * 4;
					const color = colors[idx];
					if (!color) continue;
					pixels[pos] = color[2]; // R
					pixels[pos + 1] = color[1]; // G
					pixels[pos + 2] = color[0]; // B
					pixels[pos + 3] = color[3]; // A
				}
			}
		}
	}

	return {
		width,
		height,
		format: DdsFormat.RgbS3TcDxt1Format,
		mipmaps: [{ width, height, data: pixels }],
	};
}

/**
 * 解码 DXT3 块 (显式 alpha)
 */
function decodeDxt3(data: Buffer, width: number, height: number): DdsTexture {
	const pixels = Buffer.alloc(width * height * 4);
	let offset = 0;

	for (let y = 0; y < height; y += 4) {
		for (let x = 0; x < width; x += 4) {
			// 读取 alpha (4 ushorts = 64 bits for 16 pixels)
			const alpha0 = data.readUInt16LE(offset);
			const alpha1 = data.readUInt16LE(offset + 2);
			const alpha2 = data.readUInt16LE(offset + 4);
			const alpha3 = data.readUInt16LE(offset + 6);
			offset += 8;

			// 读取颜色端点 (RGB565)
			const c0 = data.readUInt16LE(offset);
			const c1 = data.readUInt16LE(offset + 2);
			offset += 4;

			// 读取索引 (32 bits)
			const index = data.readUInt32LE(offset);
			offset += 4;

			// 解码 RGB565
			const color0 = decodeRgb565(c0);
			const color1 = decodeRgb565(c1);

			const colors: [number, number, number][] = [
				[color0[0], color0[1], color0[2]],
				[color1[0], color1[1], color1[2]],
				[
					Math.round((color0[0] * 2 + color1[0]) / 3),
					Math.round((color0[1] * 2 + color1[1]) / 3),
					Math.round((color0[2] * 2 + color1[2]) / 3),
				],
				[
					Math.round((color0[0] + color1[0] * 2) / 3),
					Math.round((color0[1] + color1[1] * 2) / 3),
					Math.round((color0[2] + color1[2] * 2) / 3),
				],
			];

			const alphas = [alpha0, alpha1, alpha2, alpha3];

			// 解码每个像素
			for (let i = 0; i < 16; i++) {
				const alphaIdx = Math.floor(i / 4);
				const a = alphas[alphaIdx];
				if (a === undefined) continue;
				const alpha = (a >> ((i % 4) * 4)) & 0xf;

				const px = x + (i % 4);
				const py = y + Math.floor(i / 4);

				if (px < width && py < height) {
					const idx = (index >> (i * 2)) & 0x3;
					const pos = (py * width + px) * 4;
					const color = colors[idx];
					if (!color) continue;
					pixels[pos] = color[2]; // R
					pixels[pos + 1] = color[1]; // G
					pixels[pos + 2] = color[0]; // B
					pixels[pos + 3] = (alpha << 4) | alpha; // Expand 4-bit to 8-bit
				}
			}
		}
	}

	return {
		width,
		height,
		format: DdsFormat.RgbaS3TcDxt3Format,
		mipmaps: [{ width, height, data: pixels }],
	};
}

/**
 * 解码 DXT5 块 (插值 alpha)
 */
function decodeDxt5(data: Buffer, width: number, height: number): DdsTexture {
	const pixels = Buffer.alloc(width * height * 4);
	let offset = 0;

	for (let y = 0; y < height; y += 4) {
		for (let x = 0; x < width; x += 4) {
			// 读取 alpha 端点
			const a0 = data.readUInt8(offset++);
			const a1 = data.readUInt8(offset++);

			// 计算 8 个 alpha 值
			const alphas = new Array<number>(8);
			if (a0 > a1) {
				alphas[0] = a0;
				alphas[1] = a1;
				alphas[2] = Math.round((6 * a0 + 1 * a1) / 7);
				alphas[3] = Math.round((5 * a0 + 2 * a1) / 7);
				alphas[4] = Math.round((4 * a0 + 3 * a1) / 7);
				alphas[5] = Math.round((3 * a0 + 4 * a1) / 7);
				alphas[6] = Math.round((2 * a0 + 5 * a1) / 7);
				alphas[7] = Math.round((1 * a0 + 6 * a1) / 7);
			} else {
				alphas[0] = a0;
				alphas[1] = a1;
				alphas[2] = Math.round((4 * a0 + 1 * a1) / 5);
				alphas[3] = Math.round((3 * a0 + 2 * a1) / 5);
				alphas[4] = Math.round((2 * a0 + 3 * a1) / 5);
				alphas[5] = Math.round((1 * a0 + 4 * a1) / 5);
				alphas[6] = 0x00;
				alphas[7] = 0xff;
			}

			// 读取 alpha 索引 (48 bits for 16 pixels, 3 bits each)
			let alphaIndex = 0;
			for (let i = 0; i < 6; i++) {
				alphaIndex |= data.readUInt8(offset++) << (i * 8);
			}

			// 读取颜色端点 (RGB565)
			const c0 = data.readUInt16LE(offset);
			const c1 = data.readUInt16LE(offset + 2);
			offset += 4;

			// 读取颜色索引 (32 bits)
			const colorIndex = data.readUInt32LE(offset);
			offset += 4;

			// 解码 RGB565
			const color0 = decodeRgb565(c0);
			const color1 = decodeRgb565(c1);

			const colors: [number, number, number][] = [
				[color0[0], color0[1], color0[2]],
				[color1[0], color1[1], color1[2]],
				[
					Math.round((color0[0] * 2 + color1[0]) / 3),
					Math.round((color0[1] * 2 + color1[1]) / 3),
					Math.round((color0[2] * 2 + color1[2]) / 3),
				],
				[
					Math.round((color0[0] + color1[0] * 2) / 3),
					Math.round((color0[1] + color1[1] * 2) / 3),
					Math.round((color0[2] + color1[2] * 2) / 3),
				],
			];

			// 解码每个像素
			for (let i = 0; i < 16; i++) {
				const alphaBitIdx = i * 3;
				const alphaIdx = (alphaIndex >> alphaBitIdx) & 0x7;

				const px = x + (i % 4);
				const py = y + Math.floor(i / 4);

				if (px < width && py < height) {
					const colorIdx = (colorIndex >> (i * 2)) & 0x3;
					const pos = (py * width + px) * 4;
					const color = colors[colorIdx];
					const alpha = alphas[alphaIdx];
					if (!color || alpha === undefined) continue;
					pixels[pos] = color[2];
					pixels[pos + 1] = color[1];
					pixels[pos + 2] = color[0];
					pixels[pos + 3] = alpha;
				}
			}
		}
	}

	return {
		width,
		height,
		format: DdsFormat.RgbaS3TcDxt5Format,
		mipmaps: [{ width, height, data: pixels }],
	};
}

/**
 * 解码 RGB565 颜色为 RGBA
 */
function decodeRgb565(color: number): [number, number, number, number] {
	const r = color & 0x1f;
	const g = (color >> 5) & 0x3f;
	const b = (color >> 11) & 0x1f;

	return [
		(r << 3) | (r >> 2), // R: 5 bits -> 8 bits
		(g << 2) | (g >> 4), // G: 6 bits -> 8 bits
		(b << 3) | (b >> 2), // B: 5 bits -> 8 bits
		0xff, // A: fully opaque
	];
}
