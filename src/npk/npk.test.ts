import { describe, expect, test } from "bun:test";
import { NPK_FLAG } from "../types/npk";
import { decryptPath, encryptPath, generateKey } from "../utils/crypto";

describe("crypto utilities", () => {
	test("generateKey should return 256 bytes key", () => {
		const key = generateKey();
		expect(key).toBeInstanceOf(Uint8Array);
		expect(key.length).toBe(256);
	});

	test("generateKey should have correct header bytes", () => {
		const key = generateKey();
		const expectedHeader = "puchikon@neople dungeon and fighter ";
		const decoder = new TextDecoder();
		const actualHeader = decoder.decode(key.subarray(0, expectedHeader.length));
		expect(actualHeader).toBe(expectedHeader);
	});

	test("generateKey should fill rest with DNF bytes", () => {
		const key = generateKey();
		// After header (36 bytes), should be filled with 'DNF' repeated
		// header is 36 bytes, so bytes 36-254 should be DNF cycle
		for (let i = 36; i < 255; i++) {
			const expected = "DNF".charCodeAt(i % 3);
			expect(key[i]).toBe(expected);
		}
		expect(key[255]).toBe(0);
	});

	test("encryptPath and decryptPath should be inverse", () => {
		const key = generateKey();
		// Use the real NPK path which doesn't have collision issues
		const testPath = "sprite/monster/screamingcave/apopis/(tn)apopis.img";

		const encrypted = encryptPath(testPath, key);
		const decrypted = decryptPath(encrypted, key);

		expect(decrypted).toBe(testPath);
	});
});

describe("NPK structure", () => {
	test("NPK_FLAG should be NeoplePack_Bill", () => {
		expect(NPK_FLAG).toBe("NeoplePack_Bill");
	});
});
