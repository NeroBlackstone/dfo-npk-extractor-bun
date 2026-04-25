import { writeFileSync } from "node:fs";
import { deflateSync } from "zlib";

// 构建 Ver2 格式测试 NPK（包含 LINK sprite）
// 3 sprites: [0] ARGB_1555 ZLIB红色, [1] LINK->[0], [2] ARGB_1555 ZLIB蓝色

function buildVer2Img(): Buffer {
	const indexLength = 36 + 8 + 36; // sprite0 + link + sprite2 = 80 bytes

	const rawData0 = Buffer.alloc(32 * 32 * 2);
	const rawData2 = Buffer.alloc(32 * 32 * 2);

	for (let i = 0; i < 32 * 32; i++) {
		rawData0.writeUInt16LE(0x7fff, i * 2);
	}

	for (let i = 0; i < 32 * 32; i++) {
		rawData2.writeUInt16LE(0x7800, i * 2);
	}

	const compressed0 = deflateSync(rawData0);
	const compressed2 = deflateSync(rawData2);

	const buf = Buffer.alloc(
		16 + 8 + 4 + 4 + indexLength + compressed0.length + compressed2.length,
	);

	const flagStr = "Neople Img File";
	for (let i = 0; i < 16; i++) {
		buf[i] = i < flagStr.length ? flagStr.charCodeAt(i) : 0;
	}

	buf.writeBigInt64LE(BigInt(indexLength), 16);
	buf.writeInt32LE(2, 24);
	buf.writeInt32LE(3, 28);

	buf.writeInt32LE(0x0e, 32);
	buf.writeInt32LE(0x06, 36);
	buf.writeInt32LE(32, 40);
	buf.writeInt32LE(32, 44);
	buf.writeInt32LE(compressed0.length, 48);
	buf.writeInt32LE(0, 52);
	buf.writeInt32LE(0, 56);
	buf.writeInt32LE(32, 60);
	buf.writeInt32LE(32, 64);

	buf.writeInt32LE(0x11, 68);
	buf.writeInt32LE(0, 72);

	buf.writeInt32LE(0x0e, 76);
	buf.writeInt32LE(0x06, 80);
	buf.writeInt32LE(32, 84);
	buf.writeInt32LE(32, 88);
	buf.writeInt32LE(compressed2.length, 92);
	buf.writeInt32LE(10, 96);
	buf.writeInt32LE(10, 100);
	buf.writeInt32LE(32, 104);
	buf.writeInt32LE(32, 108);

	compressed0.copy(buf, 112);
	compressed2.copy(buf, 112 + compressed0.length);

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

const img = buildVer2Img();
const npk = buildNpk(img);
writeFileSync("test/sprite_test_ver2.NPK", npk);
console.log("Created test/sprite_test_ver2.NPK, size:", npk.length);
