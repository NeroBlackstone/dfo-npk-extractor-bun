import { describe, expect, test } from "bun:test";
import type { PvfStringContext } from "../types";
import { parseScriptFileToJson } from "./script-file-json";
import { convertStrToJson } from "./str-json";

/**
 * Helper: build a ScriptFile buffer from tokens.
 * Header: 0xB0 0xD0 (little-endian for 0xD0B0)
 * Each token: [type:1][data:4 LE]
 */
function buildScriptFile(
	tokens: [type: number, data: number][],
): Buffer {
	const buf = Buffer.alloc(2 + tokens.length * 5);
	buf.writeUInt16LE(0xd0b0, 0);
	for (let i = 0; i < tokens.length; i++) {
		const offset = 2 + i * 5;
		buf[offset] = tokens[i][0];
		buf.writeInt32LE(tokens[i][1], offset + 1);
	}
	return buf;
}

const emptyCtx: PvfStringContext = { binMap: [], stringMap: new Map() };

describe("parseScriptFileToJson", () => {
	test("should return empty array for short data", () => {
		expect(parseScriptFileToJson(Buffer.alloc(2), emptyCtx)).toEqual([]);
	});

	test("should parse a single Int section", () => {
		const ctx: PvfStringContext = {
			binMap: ["", "level", ""],
			stringMap: new Map(),
		};
		// [level] section with Int value 10
		// Token 0: type=5, data=1 → binMap[1]="level"
		// Token 1: type=2, data=10 → Int 10
		const data = buildScriptFile([
			[5, 1],
			[2, 10],
		]);
		const result = parseScriptFileToJson(data, ctx);
		expect(result).toEqual([{ level: 10 }]);
	});

	test("should parse a multi-value section into array", () => {
		const ctx: PvfStringContext = {
			binMap: ["", "width", ""],
			stringMap: new Map(),
		};
		const data = buildScriptFile([
			[5, 1],
			[2, 40],
			[2, 10],
		]);
		const result = parseScriptFileToJson(data, ctx);
		expect(result).toEqual([{ width: [40, 10] }]);
	});

	test("should parse String values", () => {
		const ctx: PvfStringContext = {
			binMap: ["", "name", "slime"],
			stringMap: new Map(),
		};
		const data = buildScriptFile([
			[5, 1],
			[7, 2],
		]);
		const result = parseScriptFileToJson(data, ctx);
		expect(result).toEqual([{ name: "slime" }]);
	});

	test("should parse container section (with close tag)", () => {
		const ctx: PvfStringContext = {
			binMap: ["", "[dungeon]", "[/dungeon]", "static_data", ""],
			stringMap: new Map(),
		};
		// [dungeon] → [static_data] → [/static_data] → [/dungeon]
		// But per spec, static_data is leaf, dungeon is container
		const data = buildScriptFile([
			[5, 1], // [dungeon]
			[5, 3], // [static_data]
			[2, 130],
			[2, 150],
			[2, 500],
			[5, 2], // [/dungeon]
		]);
		const result = parseScriptFileToJson(data, ctx);
		expect(result).toEqual([
			{
				dungeon: [
					{
						static_data: [130, 150, 500],
					},
				],
			},
		]);
	});

	test("should discard CommandSeparator (type 8)", () => {
		const ctx: PvfStringContext = {
			binMap: ["", "level", "sep"],
			stringMap: new Map(),
		};
		const data = buildScriptFile([
			[5, 1], // [level]
			[2, 10],
			[8, 2], // CommandSeparator → discard
			[2, 20],
		]);
		const result = parseScriptFileToJson(data, ctx);
		expect(result).toEqual([{ level: [10, 20] }]);
	});

	test("should format StringLink as @listId::name", () => {
		const ctx: PvfStringContext = {
			binMap: ["", "ability_category", "hp_max"],
			stringMap: new Map(),
		};
		const data = buildScriptFile([
			[5, 1], // [ability_category]
			[9, 0], // StringLinkIndex → listId=0
			[10, 2], // StringLink → binMap[2]="hp_max"
		]);
		const result = parseScriptFileToJson(data, ctx);
		expect(result).toEqual([
			{
				ability_category: "@0::hp_max",
			},
		]);
	});

	test("should parse mixed values in section", () => {
		const ctx: PvfStringContext = {
			binMap: ["*", "ability_category", "hp_max", "phys_atk"],
			stringMap: new Map(),
		};
		const data = buildScriptFile([
			[5, 1], // [ability_category]
			[9, 1], // StringLinkIndex → listId=1
			[10, 2], // StringLink → "hp_max"
			[7, 0], // String → "*"
			[2, 140], // Int → 140
			[9, 1], // StringLinkIndex → listId=1
			[10, 3], // StringLink → "phys_atk"
			[7, 0], // String → "*"
			[2, 100], // Int → 100
		]);
		const result = parseScriptFileToJson(data, ctx);
		expect(result).toEqual([
			{
				ability_category: ["@1::hp_max", "*", 140, "@1::phys_atk", "*", 100],
			},
		]);
	});

	test("should parse Float values", () => {
		const ctx: PvfStringContext = {
			binMap: ["", "speed"],
			stringMap: new Map(),
		};
		const buf = Buffer.alloc(2 + 2 * 5);
		buf.writeUInt16LE(0xd0b0, 0);
		// Token 0: section
		buf[2] = 5;
		buf.writeInt32LE(1, 3);
		// Token 1: float 3.14
		buf[7] = 4;
		buf.writeFloatLE(3.14, 8);
		const result = parseScriptFileToJson(buf, ctx);
		// Float should be approximately 3.14
		const first = result[0] as Record<string, unknown>;
		expect(first.speed).toBeCloseTo(3.14, 2);
	});

	test("should parse deeply nested sections", () => {
		const ctx: PvfStringContext = {
			binMap: [
				"(SKILL)", // 0
				"[mob]", // 1
				"[/mob]", // 2
				"[action_info]", // 3
				"[/action_info]", // 4
				"attack", // 5
				"[/attack]", // 6
				"command", // 7
				"(ATTACK)", // 8
			],
			stringMap: new Map(),
		};
		const data = buildScriptFile([
			[5, 1], // [mob]
			[5, 3], // [action_info]
			[5, 5], // [attack]
			[5, 7], // [command]
			[6, 0], // Command: "(SKILL)"
			[8, 0], // CommandSeparator: discard
			[6, 8], // Command: "(ATTACK)"
			[5, 6], // [/attack]
			[5, 4], // [/action_info]
			[5, 2], // [/mob]
		]);
		const result = parseScriptFileToJson(data, ctx);
		expect(result).toEqual([
			{
				mob: [
					{
						action_info: [
							{
								attack: [
									{
										command: ["(SKILL)", "(ATTACK)"],
									},
								],
							},
						],
					},
				],
			},
		]);
	});
});

describe("convertStrToJson", () => {
	test("should parse key>value lines", () => {
		const data = Buffer.from("hp_max>HP MAX\nmp_max>MP MAX", "utf-8");
		const result = JSON.parse(convertStrToJson(data));
		expect(result).toEqual({ hp_max: "HP MAX", mp_max: "MP MAX" });
	});

	test("should skip comments and blank lines", () => {
		const data = Buffer.from(
			"// comment\n\nkey>value\n// another comment",
			"utf-8",
		);
		const result = JSON.parse(convertStrToJson(data));
		expect(result).toEqual({ key: "value" });
	});

	test("should return empty object for empty input", () => {
		const data = Buffer.from("", "utf-8");
		const result = JSON.parse(convertStrToJson(data));
		expect(result).toEqual({});
	});

	test("should handle lines without > separator", () => {
		const data = Buffer.from("valid>yes\ninvalid_line\nok>true", "utf-8");
		const result = JSON.parse(convertStrToJson(data));
		expect(result).toEqual({ valid: "yes", ok: "true" });
	});
});
