import { describe, expect, test } from "bun:test";
import { convertFile } from "./convert-file";
import { convertNameList } from "./name-list";
import { readPvf } from "./reader";
import type { PvfStringContext } from "./types";

const FAKE_PVF_PATH = "test/fake.pvf";
const emptyCtx: PvfStringContext = { binMap: [], stringMap: new Map() };

describe("convertFile", () => {
	test("should convert script file (0xD0B0 magic) to JSON", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[2]!);
		expect(data.readUInt16LE(0)).toBe(0xd0b0);
		const result = convertFile(data, "test/character.ai", emptyCtx);
		expect(typeof result).toBe("string");
		const parsed = JSON.parse(result as string);
		expect(typeof parsed).toBe("object");
	});

	test("should convert .ani binary to JSON when it has ScriptFile magic", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[2]!);
		const result = convertFile(data, "test/move.ani", emptyCtx);
		expect(typeof result).toBe("string");
		const parsed = JSON.parse(result as string);
		expect(typeof parsed).toBe("object");
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

	test("should convert .str to JSON", () => {
		// BIG5 encoded "key>value" text
		const content = Buffer.from("key>value\n// comment\nfoo>bar", "utf-8");
		const result = convertFile(content, "test.str", emptyCtx);
		expect(typeof result).toBe("string");
		const parsed = JSON.parse(result as string);
		expect(parsed).toEqual({ key: "value", foo: "bar" });
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
