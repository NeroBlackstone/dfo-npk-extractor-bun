import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// 构建 Ver4 格式测试 NPK（无 LINK，纯色测试）

function buildVer4Img(): Buffer {
	const spriteCount = 2;
	const paletteColors = 4;
	const paletteSize = paletteColors * 4;
	const spriteEntriesSize = spriteCount * 36;
	const indexLength = spriteEntriesSize;

	const rawData = Buffer.alloc(32 * 32);
	for (let i = 0; i < 32 * 32; i++) {
		rawData[i] = i % paletteColors;
	}
	const compressedData = deflateSync(rawData);

	const buf = Buffer.alloc(
		32 + 4 + paletteSize + spriteEntriesSize + compressedData.length,
	);

	const flagStr = "Neople Img File";
	for (let i = 0; i < 16; i++) {
		buf[i] = i < flagStr.length ? flagStr.charCodeAt(i) : 0;
	}

	buf.writeBigInt64LE(BigInt(indexLength), 16);
	buf.writeInt32LE(4, 24);
	buf.writeInt32LE(2, 28);
	buf.writeInt32LE(paletteColors, 32);

	buf.writeUInt8(0x00, 36);
	buf.writeUInt8(0x00, 37);
	buf.writeUInt8(0xff, 38);
	buf.writeUInt8(0xff, 39);
	buf.writeUInt8(0x00, 40);
	buf.writeUInt8(0xff, 41);
	buf.writeUInt8(0x00, 42);
	buf.writeUInt8(0xff, 43);
	buf.writeUInt8(0xff, 44);
	buf.writeUInt8(0x00, 45);
	buf.writeUInt8(0x00, 46);
	buf.writeUInt8(0xff, 47);
	buf.writeUInt8(0xff, 48);
	buf.writeUInt8(0xff, 49);
	buf.writeUInt8(0xff, 50);
	buf.writeUInt8(0xff, 51);

	buf.writeInt32LE(0x0e, 52);
	buf.writeInt32LE(0x06, 56);
	buf.writeInt32LE(32, 60);
	buf.writeInt32LE(32, 64);
	buf.writeInt32LE(compressedData.length, 68);
	buf.writeInt32LE(0, 72);
	buf.writeInt32LE(0, 76);
	buf.writeInt32LE(32, 80);
	buf.writeInt32LE(32, 84);

	buf.writeInt32LE(0x0e, 88);
	buf.writeInt32LE(0x06, 92);
	buf.writeInt32LE(32, 96);
	buf.writeInt32LE(32, 100);
	buf.writeInt32LE(compressedData.length, 104);
	buf.writeInt32LE(5, 108);
	buf.writeInt32LE(5, 112);
	buf.writeInt32LE(32, 116);
	buf.writeInt32LE(32, 120);

	compressedData.copy(buf, 124);

	return buf;
}

function buildNpk(imgData: Buffer): Buffer {
	const npkHeader = Buffer.alloc(20);
	npkHeader.write("NeoplePack_Bill", 0, 16, "ascii");
	npkHeader.writeInt32LE(1, 16);

	const entry = Buffer.alloc(264);
	entry.writeInt32LE(20 + 264, 0);
	entry.writeInt32LE(imgData.length, 4);

	const path = "test/sprite/album0/img.img";
	const key = generateKey();
	const pathBytes = Buffer.from(path, "utf8");
	for (let i = 0; i < 256; i++) {
		const byte: number = i < pathBytes.length ? pathBytes.readUInt8(i) : 0;
		entry[i + 8] = (byte ^ key[i]) & 0xff;
	}

	return Buffer.concat([npkHeader, entry, imgData]);
}

function generateKey(): Uint8Array {
	const KEY_HEADER = "puchikon@neople dungeon and fighter ";
	const key = new Uint8Array(256);
	const headerBytes = new TextEncoder().encode(KEY_HEADER);
	key.set(headerBytes);
	for (let i = headerBytes.length; i < 255; i++) {
		key[i] = "DNF".charCodeAt(i % 3);
	}
	key[255] = 0;
	return key;
}

const img = buildVer4Img();
const npk = buildNpk(img);
writeFileSync("test/sprite_test_ver4.NPK", npk);
console.log("Created test/sprite_test_ver4.NPK, size:", npk.length);
