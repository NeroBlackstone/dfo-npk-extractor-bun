import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	decryptPvfData,
	PVF_HEADER_SIZE,
	readPvf,
	readPvfHeader,
} from "./reader";

const FAKE_PVF_PATH = "test/fake.pvf";

describe("PVF header", () => {
	test("readPvfHeader should parse header correctly", () => {
		const buffer = readFileSync(FAKE_PVF_PATH);
		const header = readPvfHeader(buffer);

		expect(header.sizeGUID).toBe(0x24);
		expect(header.GUID.length).toBe(0x24);
		expect(header.fileVersion).toBe(1);
		expect(header.dirTreeLength).toBeGreaterThan(0);
		expect(header.dirTreeChecksum).toBe(0xaabbccdd);
		expect(header.numFilesInDirTree).toBe(2);
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
		const crc32 = 0xdeadbeef;

		// 加密（用循环左移模拟）
		const PASSWORD_PVF = 0x81a79011;
		function rotateLeft32(x: number, n: number): number {
			x = x >>> 0;
			return ((x << n) | (x >>> (32 - n))) >>> 0;
		}
		const view = new DataView(encrypted.buffer);
		const key = (PASSWORD_PVF ^ crc32) >>> 0;
		for (let i = 0; i < 2; i++) {
			const offset = i * 4;
			const value = view.getUint32(offset, true);
			const enc = (rotateLeft32(value, 6) ^ key) >>> 0;
			view.setUint32(offset, enc, true);
		}

		// 解密
		const decrypted = new Uint8Array(encrypted);
		decryptPvfData(decrypted, 8, crc32);

		expect(Buffer.from(decrypted)).toEqual(original);
	});
});

describe("PVF reader", () => {
	const buffer = readFileSync(FAKE_PVF_PATH);
	const { header, entries, getFileData } = readPvf(buffer);

	test("should read correct header", () => {
		expect(header.sizeGUID).toBe(0x24);
		expect(header.fileVersion).toBe(1);
		expect(header.numFilesInDirTree).toBe(2);
		expect(header.dirTreeChecksum).toBe(0xaabbccdd);
	});

	test("should read all file entries", () => {
		expect(entries.length).toBe(2);
	});

	test("first entry should have correct metadata", () => {
		const entry = entries[0];
		expect(entry.fileNumber).toBe(0);
		expect(entry.filePath).toBe("test/hello.txt");
		expect(entry.fileLength).toBe(11);
		expect(entry.fileCrc32).toBe(0x12345678);
		expect(entry.relativeOffset).toBe(0);
	});

	test("second entry should have correct metadata", () => {
		const entry = entries[1];
		expect(entry.fileNumber).toBe(1);
		expect(entry.filePath).toBe("test/world.bin");
		expect(entry.fileLength).toBe(5);
		expect(entry.fileCrc32).toBe(0x87654321);
		expect(entry.relativeOffset).toBe(12); // 11 aligned to 4 = 12
	});

	test("getFileData should decrypt first file correctly", () => {
		const data = getFileData(entries[0]);
		expect(data.toString("utf-8")).toBe("Hello, PVF!");
	});

	test("getFileData should decrypt second file correctly", () => {
		const data = getFileData(entries[1]);
		expect(data.length).toBe(5);
		expect([...data]).toEqual([0x01, 0x02, 0x03, 0x04, 0x05]);
	});

	test("absoluteOffset should point past header and dirTree", () => {
		const entry = entries[0];
		expect(entry.absoluteOffset).toBe(PVF_HEADER_SIZE + header.dirTreeLength);
	});
});
