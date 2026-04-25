import { writeFileSync } from "node:fs";

// 构建音频测试 NPK

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

function encryptPath(path: string, key: Uint8Array): Buffer {
	const pathBytes = Buffer.from(path, "utf8");
	const encrypted = Buffer.alloc(256);
	for (let i = 0; i < 256; i++) {
		const pathByte: number = i < pathBytes.length ? pathBytes.readUInt8(i) : 0;
		encrypted[i] = (pathByte ^ key[i]) & 0xff;
	}
	return encrypted;
}

function buildOggData(name: string): Buffer {
	const header = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
	const nameBuf = Buffer.from(name, "utf8");
	return Buffer.concat([header, nameBuf]);
}

function buildAudioNpk(): Buffer {
	const key = generateKey();

	const audio1 = buildOggData("click1");
	const audio2 = buildOggData("click2");

	const npkHeader = Buffer.alloc(20);
	npkHeader.write("NeoplePack_Bill", 0, 16, "ascii");
	npkHeader.writeInt32LE(2, 16);

	const entry1 = Buffer.alloc(264);
	entry1.writeInt32LE(20 + 264 * 2, 0);
	entry1.writeInt32LE(audio1.length, 4);
	encryptPath("test/sounds/click1.ogg", key).copy(entry1, 8);

	const entry2 = Buffer.alloc(264);
	entry2.writeInt32LE(20 + 264 * 2 + audio1.length, 0);
	entry2.writeInt32LE(audio2.length, 4);
	encryptPath("test/sounds/click2.ogg", key).copy(entry2, 8);

	return Buffer.concat([npkHeader, entry1, entry2, audio1, audio2]);
}

const npk = buildAudioNpk();
writeFileSync("test/test_audio.npk", npk);
console.log("Created test/test_audio.npk, size:", npk.length);
