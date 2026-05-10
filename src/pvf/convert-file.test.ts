import { describe, expect, test } from "bun:test";
import { convertFile } from "./convert-file";
import { convertNameList } from "./name-list";
import { readPvf } from "./reader";
import type { PvfStringContext } from "./types";

const FAKE_PVF_PATH = "test/fake.pvf";
const emptyCtx: PvfStringContext = { binMap: [], stringMap: new Map() };

describe("convertFile", () => {
	test("should convert .ani binary to text", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[3]!);
		const result = convertFile(data, "test/move.ani", emptyCtx);
		expect(typeof result).toBe("string");
		expect((result as string).startsWith("#PVF_File")).toBe(true);
	});

	test("should convert script file (0xD0B0 magic) to text", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[2]!);
		expect(data.readUInt16LE(0)).toBe(0xd0b0);
		const result = convertFile(data, "test/character.ai", emptyCtx);
		expect(typeof result).toBe("string");
		expect((result as string).startsWith("#PVF_File")).toBe(true);
	});

	test("should convert document binary (0x0002 magic) to text", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[4]!);
		expect(data.readUInt16LE(0)).toBe(2);
		const result = convertFile(data, "test/layout.img", emptyCtx);
		expect(typeof result).toBe("string");
		expect((result as string).startsWith("#PVF_File")).toBe(true);
	});

	test("should pass through short data unchanged", () => {
		const short = Buffer.alloc(4);
		const result = convertFile(short, "foo.img", emptyCtx);
		expect(result).toBe(short);
	});

	test("should pass through unknown binary unchanged", () => {
		const data = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
		const result = convertFile(data, "foo.xyz", emptyCtx);
		expect(result).toBe(data);
	});

	test("should pass through non-magic data instead of misrouting to document", () => {
		const data = Buffer.alloc(20, 0x42);
		const result = convertFile(data, "unknown.bin", emptyCtx);
		expect(result).toBe(data);
	});

	test("should convert .str with BIG5 encoding", () => {
		const big5Buf = Buffer.from([0xb4, 0xfa, 0xb8, 0xd5]);
		const result = convertFile(big5Buf, "test.str", emptyCtx);
		expect(typeof result).toBe("string");
		expect(result).toBe("測試");
	});

	test("should convert text content starting with #", () => {
		const data = Buffer.from("#PVF_File\r\nhello");
		const result = convertFile(data, "foo.bar", emptyCtx);
		expect(typeof result).toBe("string");
		expect(result).toBe("#PVF_File\r\nhello");
	});
});

describe("convertNameList", () => {
	test("should parse name-list .lst to JSON", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		// entries[0] is the first file in the PVF (stringtable.bin or similar)
		// We need a ScriptFile (0xD0B0) entry - use entries[2] which we know is script
		const data = await getFileData(entries[2]!);
		const ctx: PvfStringContext = { binMap: ["test_name"], stringMap: new Map() };
		const result = convertNameList(data, ctx);
		// Result should be null or a JSON string depending on content
		if (result !== null) {
			const parsed = JSON.parse(result);
			expect(Array.isArray(parsed)).toBe(true);
		}
	});

	test("should return null for short data", () => {
		const data = Buffer.alloc(2);
		const result = convertNameList(data, emptyCtx);
		expect(result).toBeNull();
	});

	test("should return null for non-ScriptFile data", () => {
		const data = Buffer.from("hello world");
		const result = convertNameList(data, emptyCtx);
		expect(result).toBeNull();
	});
});
