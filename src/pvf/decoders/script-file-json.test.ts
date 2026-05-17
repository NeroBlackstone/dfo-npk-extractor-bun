import { describe, expect, test } from "bun:test";
import { parseScriptFileToJson } from "./script-file-json";
import type { PvfStringContext } from "../types";

function buildBuffer(tokens: { t: number; v: number }[]): Buffer {
	const buf = Buffer.alloc(2 + tokens.length * 5);
	buf.writeUInt16LE(0xd0b0, 0);
	tokens.forEach((tk, i) => {
		buf.writeUInt8(tk.t, 2 + i * 5);
		buf.writeInt32LE(tk.v, 2 + i * 5 + 1);
	});
	return buf;
}

function makeCtx(binMap: string[]): PvfStringContext {
	return { binMap, stringMap: new Map() };
}

describe("parseScriptFileToJson", () => {
	describe("basic section parsing", () => {
		test("leaf section with single value", () => {
			// [damage] 100 [/damage]
			const ctx = makeCtx(["[damage]", "[/damage]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 100 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ damage: [100] }]);
		});

		test("leaf section with multiple values", () => {
			// [pos] 100 200 [/pos]
			const ctx = makeCtx(["[pos]", "[/pos]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 100 },
				{ t: 2, v: 200 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ pos: [100, 200] }]);
		});

		test("empty leaf section outputs null", () => {
			// [empty] [/empty]
			const ctx = makeCtx(["[empty]", "[/empty]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ empty: null }]);
		});
	});

	describe("container section detection", () => {
		test("section with nested section is container", () => {
			// [parent] [child] 1 [/child] [/parent]
			const ctx = makeCtx(["[parent]", "[/parent]", "[child]", "[/child]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 5, v: 2 },
				{ t: 2, v: 1 },
				{ t: 5, v: 3 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ parent: [{ child: [1] }] }]);
		});

		test("section without nested section is leaf", () => {
			// [single] 42 [/single]
			const ctx = makeCtx(["[single]", "[/single]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 42 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ single: [42] }]);
		});

		test("empty container outputs null", () => {
			// [container] [/container]
			const ctx = makeCtx(["[container]", "[/container]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ container: null }]);
		});
	});

	describe("multiple sections at same level", () => {
		test("sibling sections", () => {
			// [a] 1 [/a] [b] 2 [/b]
			const ctx = makeCtx(["[a]", "[/a]", "[b]", "[/b]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 1 },
				{ t: 5, v: 1 },
				{ t: 5, v: 2 },
				{ t: 2, v: 2 },
				{ t: 5, v: 3 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ a: [1] }, { b: [2] }]);
		});
	});

	describe("nested containers", () => {
		test("three levels of nesting", () => {
			// [level1] [level2] [level3] 999 [/level3] [/level2] [/level1]
			const ctx = makeCtx([
				"[level1]", "[/level1]",
				"[level2]", "[/level2]",
				"[level3]", "[/level3]",
			]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 5, v: 2 },
				{ t: 5, v: 4 },
				{ t: 2, v: 999 },
				{ t: 5, v: 5 },
				{ t: 5, v: 3 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ level1: [{ level2: [{ level3: [999] }] }] }]);
		});
	});

	describe("key normalization", () => {
		test("spaces become underscores", () => {
			// [my key] 10 [/my key]
			const ctx = makeCtx(["[my key]", "[/my key]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 10 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ my_key: [10] }]);
		});

		test("brackets in section names are stripped", () => {
			// [section name] 5 [/section name]
			const ctx = makeCtx(["[section name]", "[/section name]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 5 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ section_name: [5] }]);
		});
	});

	describe("value types", () => {
		test("Int type 2", () => {
			const ctx = makeCtx(["[val]", "[/val]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 42 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ val: [42] }]);
		});

		test("IntEx type 3", () => {
			const ctx = makeCtx(["[val]", "[/val]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 3, v: -100 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ val: [-100] }]);
		});

		test("Float type 4", () => {
			const ctx = makeCtx(["[val]", "[/val]"]);
			const buf = Buffer.alloc(2 + 3 * 5);
			buf.writeUInt16LE(0xd0b0, 0);
			buf.writeUInt8(5, 2); buf.writeInt32LE(0, 3); // [val]
			buf.writeUInt8(4, 7); buf.writeFloatLE(3.14, 8); // float 3.14
			buf.writeUInt8(5, 12); buf.writeInt32LE(1, 13); // [/val]
			const result = parseScriptFileToJson(buf, ctx);
			// Float is returned as string, 3.14 in IEEE 754 is approximated
			expect(result).toEqual([{ val: ["3.140000104904175"] }]);
		});

		test("String type 7", () => {
			const ctx = makeCtx(["[val]", "[/val]", "hello"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 7, v: 2 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ val: ["hello"] }]);
		});

		test("Command type 6", () => {
			const ctx = makeCtx(["[val]", "[/val]", "UP"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 6, v: 2 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ val: ["UP"] }]);
		});
	});

	describe("CommandSeparator type 8", () => {
		test("is discarded", () => {
			const ctx = makeCtx(["[val]", "[/val]", "sep"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 8, v: 2 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ val: null }]);
		});
	});

	describe("StringLink type 9+10", () => {
		test("combines type 9 listId and type 10 keyName", () => {
			// [link] type9(17) type10(keyIdx=2) [/link]
			const ctx = makeCtx(["[link]", "[/link]", "", "", "mirror_name"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 9, v: 17 },
				{ t: 10, v: 4 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ link: ["@17::mirror_name"] }]);
		});

		test("type 9 alone returns undefined", () => {
			const ctx = makeCtx(["[link]", "[/link]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 9, v: 5 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ link: null }]);
		});
	});

	describe("top-level sections", () => {
		test("multiple independent sections at root", () => {
			const ctx = makeCtx(["[a]", "[/a]", "[b]", "[/b]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 1 },
				{ t: 5, v: 1 },
				{ t: 5, v: 2 },
				{ t: 2, v: 2 },
				{ t: 5, v: 3 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ a: [1] }, { b: [2] }]);
		});
	});

	describe("edge cases", () => {
		test("data too short returns empty array", () => {
			const ctx = makeCtx([]);
			const buf = Buffer.from([0xd0, 0xb0, 0x05, 0x00]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([]);
		});

		test("section with section name containing brackets", () => {
			// [my [nested] section] - section name literally contains []
			const ctx = makeCtx(["[my [nested] section]", "[/my [nested] section]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 123 },
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			// getSectionName strips all [] so "my [nested] section" becomes "my nested section"
			expect(result[0]).toHaveProperty("my_nested_section");
			expect((result[0] as any).my_nested_section).toEqual([123]);
		});
	});

	describe("real-world patterns from json_scriptfiles", () => {
		test("skill tree pattern with alternating tags and paths", () => {
			// [skill_tree] ["[swordman]", "path1", "[fighter]", "path2", ...]
			// binMap indices: 0=[skill_tree], 1=[/skill_tree], 2=[swordman], 3=[/swordman],
			//                 4=[fighter], 5=[/fighter], 6=path1, 7=path2
			const ctx = makeCtx([
				"[skill_tree]", "[/skill_tree]",
				"[swordman]", "[/swordman]",
				"[fighter]", "[/fighter]",
				"path1", "path2",
			]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 7, v: 2 }, // "[swordman]"
				{ t: 7, v: 6 }, // path1
				{ t: 7, v: 4 }, // "[fighter]"
				{ t: 7, v: 7 }, // path2
				{ t: 5, v: 1 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ skill_tree: ["[swordman]", "path1", "[fighter]", "path2"] }]);
		});

		test("attack pattern with multiple int values", () => {
			// [damage] 100 [/damage] [push_aside] 50 [/push_aside]
			const ctx = makeCtx(["[damage]", "[/damage]", "[push_aside]", "[/push_aside]"]);
			const buf = buildBuffer([
				{ t: 5, v: 0 },
				{ t: 2, v: 100 },
				{ t: 5, v: 1 },
				{ t: 5, v: 2 },
				{ t: 2, v: 50 },
				{ t: 5, v: 3 },
			]);
			const result = parseScriptFileToJson(buf, ctx);
			expect(result).toEqual([{ damage: [100] }, { push_aside: [50] }]);
		});
	});
});