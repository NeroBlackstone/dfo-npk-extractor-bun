import { describe, expect, test } from "bun:test";
import {
	decryptPvfData,
	PVF_HEADER_SIZE,
	readPvf,
	readPvfHeader,
} from "./reader";

const FAKE_PVF_PATH = "test/fake.pvf";

describe("PVF header", () => {
	test("readPvfHeader should parse header correctly", async () => {
		const file = Bun.file(FAKE_PVF_PATH);
		const buffer = Buffer.from(await file.arrayBuffer());
		const header = readPvfHeader(buffer);

		expect(header.sizeGUID).toBe(0x24);
		expect(header.GUID.length).toBe(0x24);
		expect(header.fileVersion).toBe(1);
		expect(header.dirTreeLength).toBeGreaterThan(0);
		expect(header.dirTreeChecksum).toBe(0xaabbccdd);
		expect(header.numFilesInDirTree).toBe(5);
	});

	test("readPvfHeader should throw on invalid sizeGUID", () => {
		const badBuffer = Buffer.alloc(56);
		badBuffer.writeInt32LE(0x99, 0); // wrong sizeGUID
		expect(() => readPvfHeader(badBuffer)).toThrow("Invalid PVF header");
	});
});

describe("PVF decryption", () => {
	test("decryptPvfData should be reversible", () => {
		const original = Buffer.from([
			0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
		]);
		const encrypted = new Uint8Array(original);
		const crc32Val = 0xdeadbeef;

		// 加密（用循环左移模拟）
		const PASSWORD_PVF = 0x81a79011;
		function rotateLeft32(x: number, n: number): number {
			x = x >>> 0;
			return ((x << n) | (x >>> (32 - n))) >>> 0;
		}
		const view = new DataView(encrypted.buffer);
		const key = (PASSWORD_PVF ^ crc32Val) >>> 0;
		for (let i = 0; i < 2; i++) {
			const offset = i * 4;
			const value = view.getUint32(offset, true);
			const enc = (rotateLeft32(value, 6) ^ key) >>> 0;
			view.setUint32(offset, enc, true);
		}

		// 解密
		const decrypted = decryptPvfData(new Uint8Array(encrypted), 8, crc32Val);

		expect(Buffer.from(decrypted)).toEqual(original);
	});
});

describe("PVF reader", () => {
	test("should read correct header", async () => {
		const { header } = await readPvf(FAKE_PVF_PATH);
		expect(header.sizeGUID).toBe(0x24);
		expect(header.fileVersion).toBe(1);
		expect(header.numFilesInDirTree).toBe(5);
		expect(header.dirTreeChecksum).toBe(0xaabbccdd);
	});

	test("should read all file entries", async () => {
		const { entries } = await readPvf(FAKE_PVF_PATH);
		expect(entries.length).toBe(5);
	});

	test("first entry (hello.txt) should have correct metadata", async () => {
		const { entries } = await readPvf(FAKE_PVF_PATH);
		const entry = entries[0]!;
		expect(entry.fileNumber).toBe(0);
		expect(entry.filePath).toBe("test/hello.txt");
		expect(entry.fileLength).toBe(11);
		expect(entry.relativeOffset).toBe(0);
	});

	test("second entry (world.bin) should have correct metadata", async () => {
		const { entries } = await readPvf(FAKE_PVF_PATH);
		const entry = entries[1]!;
		expect(entry.fileNumber).toBe(1);
		expect(entry.filePath).toBe("test/world.bin");
		expect(entry.fileLength).toBe(5);
	});

	test("third entry (character.ai) should be ScriptFile", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const entry = entries[2]!;
		expect(entry.fileNumber).toBe(2);
		expect(entry.filePath).toBe("test/character.ai");
		const data = await getFileData(entry);
		// ScriptFile 前 2 字节为 0xD0B0
		expect(data.readUInt16LE(0)).toBe(0xd0b0);
	});

	test("fourth entry (move.ani) should be Binary ANI", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const entry = entries[3]!;
		expect(entry.fileNumber).toBe(3);
		expect(entry.filePath).toBe("test/move.ani");
		const data = await getFileData(entry);
		// ANI 文件以 framesCount (uint16) 开头
		expect(data.length).toBeGreaterThan(2);
		const framesCount = data.readUInt16LE(0);
		expect(framesCount).toBe(2);
	});

	test("fifth entry (layout.img) should be Document", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const entry = entries[4]!;
		expect(entry.fileNumber).toBe(4);
		expect(entry.filePath).toBe("test/layout.img");
		const data = await getFileData(entry);
		// Document 前 2 字节为 0x0002
		expect(data.readInt16LE(0)).toBe(2);
	});

	test("getFileData should decrypt hello.txt correctly", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[0]!);
		expect(data.toString("utf-8")).toBe("Hello, PVF!");
	});

	test("getFileData should decrypt world.bin correctly", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[1]!);
		expect(data.length).toBe(5);
		expect([...data]).toEqual([0x01, 0x02, 0x03, 0x04, 0x05]);
	});

	test("absoluteOffset should point past header and dirTree", async () => {
		const { header, entries } = await readPvf(FAKE_PVF_PATH);
		const entry = entries[0]!;
		expect(entry.absoluteOffset).toBe(PVF_HEADER_SIZE + header.dirTreeLength);
	});
});
