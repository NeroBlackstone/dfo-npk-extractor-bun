import { describe, expect, test } from "bun:test";
import { convertFile } from "./convert-file";
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

	test("should convert document binary to text", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[4]!);
		expect(data.readInt16LE(0)).toBe(2);
		const result = convertFile(data, "test/layout.img", emptyCtx);
		expect(typeof result).toBe("string");
		expect((result as string).startsWith("#PVF_File")).toBe(true);
	});

	test("should pass through stringtable.bin unchanged", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[0]!);
		const result = convertFile(data, "stringtable.bin", emptyCtx);
		expect(result).toBe(data);
	});

	test("should pass through short data unchanged", () => {
		const short = Buffer.alloc(4);
		const result = convertFile(short, "foo.img", emptyCtx);
		expect(result).toBe(short);
	});

	test("should pass through unknown extension unchanged", () => {
		const data = Buffer.from("hello");
		const result = convertFile(data, "foo.xyz", emptyCtx);
		expect(result).toBe(data);
	});

	test("should convert .str with BIG5 encoding", () => {
		// BIG5 encoding of "測試" = 0xB4FA 0xB8D5
		const big5Buf = Buffer.from([0xb4, 0xfa, 0xb8, 0xd5]);
		const result = convertFile(big5Buf, "test.str", emptyCtx);
		expect(typeof result).toBe("string");
		expect(result).toBe("測試");
	});
});
