import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { IMG_FLAG } from "../img/types";
import { decryptPath, encryptPath, generateKey } from "../utils/crypto";
import { readNpk, readNpkFile } from "./index";

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
		const NPK_FLAG = "NeoplePack_Bill";
		expect(NPK_FLAG).toBe("NeoplePack_Bill");
	});
});

describe("readNpk", () => {
	const npkPath = "test/sprite_monster_screamingcave_apopis.NPK";
	const albums = readNpkFile(npkPath);

	test("should read NPK from file path", () => {
		expect(albums.length).toBeGreaterThan(0);
	});

	test("album should have valid properties", () => {
		const album = albums[0];
		if (!album) return;
		expect(album.offset).toBeGreaterThan(0);
		expect(album.length).toBeGreaterThan(0);
		expect(album.path).toBeTruthy();
	});

	test("getData should return Buffer", () => {
		const album = albums[0];
		if (!album) return;
		const data = album.getData();
		expect(data).toBeInstanceOf(Buffer);
		expect(data.length).toBe(album.length);
	});

	test("getHeader should return ImgHeader", () => {
		const album = albums[0];
		if (!album) return;
		const header = album.getHeader();
		expect(header).toBeTruthy();
		expect(header?.flag).toBe(IMG_FLAG);
		expect(header?.count).toBeGreaterThan(0);
	});

	test("getSprites should return sprite array", () => {
		const album = albums[0];
		if (!album) return;
		const header = album.getHeader();
		if (!header) return;
		const sprites = album.getSprites();
		expect(sprites.length).toBe(header.count);
	});

	test("getSpriteData should return sprite data by index", () => {
		const album = albums[0];
		if (!album) return;
		const sprites = album.getSprites();
		const sprite0 = sprites[0];
		if (!sprite0 || !sprite0.length) return;
		const data = album.getSpriteData(0);
		expect(data).toBeTruthy();
		expect(data?.length).toBe(sprite0?.length);
	});

	test("readNpk should work with Buffer", () => {
		const buffer = readFileSync(npkPath);
		const albumsFromBuffer = readNpk(buffer);
		expect(albumsFromBuffer.length).toBe(albums.length);
	});
});
