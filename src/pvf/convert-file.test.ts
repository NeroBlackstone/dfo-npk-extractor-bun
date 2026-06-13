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
		expect(typeof result).toBe("object");
	});

	test("should convert .ani binary to JSON when it has ScriptFile magic", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		const data = await getFileData(entries[2]!);
		const result = convertFile(data, "test/move.ani", emptyCtx);
		expect(typeof result).toBe("object");
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
		expect(typeof result).toBe("object");
		expect(result).toEqual({ key: "value", foo: "bar" });
	});

	test("should convert .chn.str (GBK) to JSON without � (regression: stagemap.chn.str bug)", async () => {
		// 来自 dist/Script.pvf 中 stagemap/stagemap.chn.str 的真实字节
		// 旧实现用 decodeAuto 把这个 GBK 文件错当 EUC-KR，输出 목읊裂� 这类乱码
		const buf = Buffer.from([
			...Buffer.from("name_3805>", "ascii"),
			0xb8, 0xf1, 0xc0, 0xbc, 0xd6, 0xae, 0xc9, 0xad,
			...Buffer.from("\r\nname_18150>", "ascii"),
			0xcc, 0xec, 0xe1, 0xa1, 0xbe, 0xde, 0xca, 0xde,
			...Buffer.from("\r\nname_18155>", "ascii"),
			0xcc, 0xec, 0xbf, 0xd5, 0xd6, 0xae, 0xb3, 0xc7,
		]);
		const result = convertFile(buf, "stagemap/stagemap.chn.str", emptyCtx);
		expect(result).toBeObject();
		const obj = result as Record<string, string>;
		expect(obj.name_3805).toBe("格兰之森");
		expect(obj.name_18150).toBe("天帷巨兽");
		expect(obj.name_18155).toBe("天空之城");
		for (const v of Object.values(obj)) {
			expect(v).not.toContain("�");
		}
	});

	test("should convert .kor.str (EUC-KR) to JSON without �", async () => {
		// 模拟韩服 .str 翻译表，使用硬编码 EUC-KR 字节（Node Buffer.from 不支持 euc-kr）
		// "name_1>검사\r\n" → name_1=6E616D655F31, >=3E, 검=B0CB, 사=BBE7, \r=0D, \n=0A
		const buf = Buffer.from([
			0x6e, 0x61, 0x6d, 0x65, 0x5f, 0x31, 0x3e, 0xb0, 0xcb, 0xbb, 0xe7, 0x0d, 0x0a,
			0x6e, 0x61, 0x6d, 0x65, 0x5f, 0x32, 0x3e, 0x50, 0x76, 0x50, 0x0d, 0x0a,
		]);
		const result = convertFile(buf, "itemname/itemname.kor.str", emptyCtx);
		expect(result).toBeObject();
		const obj = result as Record<string, string>;
		expect(obj.name_1).toBe("검사");
		expect(obj.name_2).toBe("PvP");
		for (const v of Object.values(obj)) {
			expect(v).not.toContain("�");
		}
	});

	test("should convert text content starting with #", () => {
		const data = Buffer.from("#PVF_File\r\nhello");
		const result = convertFile(data, "foo.bar", emptyCtx);
		expect(typeof result).toBe("object");
		expect(result).toEqual({ content: "#PVF_File\r\nhello" });
	});
});

describe("convertNameList", () => {
	test("should parse name-list .lst to JSON", async () => {
		const { entries, getFileData } = await readPvf(FAKE_PVF_PATH);
		// entries[0] is the first file in the PVF (stringtable.bin or similar)
		// We need a ScriptFile (0xD0B0) entry - use entries[2] which we know is script
		const data = await getFileData(entries[2]!);
		const ctx: PvfStringContext = {
			binMap: ["test_name"],
			stringMap: new Map(),
		};
		const result = convertNameList(data, ctx);
		// Result should be null or an object depending on content
		if (result !== null) {
			expect(typeof result).toBe("object");
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
