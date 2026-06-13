import { describe, expect, test } from "bun:test";
import { decodeAuto, decodeBig5, decodeEucKr, decodeGbk } from "./encoding";

describe("decodeBig5", () => {
	test("decodes BIG5 traditional Chinese", () => {
		// "喇" in BIG5: 喇=B3E2
		const buf = Buffer.from([0xb3, 0xe2]);
		expect(decodeBig5(buf)).toBe("喇");
	});
});

describe("decodeEucKr", () => {
	test("decodes EUC-KR Korean", () => {
		// "검사" in EUC-KR: 검=B0CB, 사=BBE7
		const buf = Buffer.from([0xb0, 0xcb, 0xbb, 0xe7]);
		expect(decodeEucKr(buf)).toBe("검사");
	});
});

describe("decodeGbk", () => {
	test("decodes GBK simplified Chinese", () => {
		// "剑士" in GBK: 剑=BDA3, 士=CABF
		const buf = Buffer.from([0xbd, 0xa3, 0xca, 0xbf]);
		expect(decodeGbk(buf)).toBe("剑士");
	});
});

describe("decodeAuto", () => {
	test("decodes pure GBK Chinese when EUC-KR/BIG5 produce many replacements", () => {
		// "中文" in GBK: 中=D6D0, 文=CEC4
		// 旧实现会误判为 EUC-KR（GBK 高字节与 CP949 重叠），输出带 �
		const buf = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
		const result = decodeAuto(buf);
		expect(result).not.toContain("�");
		expect(result).toMatch(/中文|中.+/);
	});

	test("decodes pure EUC-KR Korean", () => {
		// "검사" in EUC-KR
		const buf = Buffer.from([0xb0, 0xcb, 0xbb, 0xe7]);
		const result = decodeAuto(buf);
		expect(result).not.toContain("�");
		expect(result).toMatch(/[가-힯]/);
	});

	test("handles pure ASCII (no encoding needed)", () => {
		const buf = Buffer.from("hello/world/file.txt", "ascii");
		expect(decodeAuto(buf)).toBe("hello/world/file.txt");
	});

	test("handles empty buffer", () => {
		expect(decodeAuto(Buffer.alloc(0))).toBe("");
	});

	// 注意：decodeAuto 无法可靠区分 GBK vs BIG5，因为两者常用 CJK 汉字字节完全重叠
	// 实际生产中 .str 文件按文件名后缀（.chn.str → GBK、.kor.str → EUC-KR）选编码，
	// 不依赖 decodeAuto 的猜测。相关测试见 convert-file.test.ts
});
