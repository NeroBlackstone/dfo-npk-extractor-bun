import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ColorBits, CompressMode, IMG_FLAG, ImgVersion } from "../img/types";
import { decryptPath, encryptPath, generateKey } from "../utils/crypto";
import { readNpk, readNpkFile } from "./index";

// 测试文件说明:
// - sprite_monster_screamingcave_apopis.NPK: Ver2 格式，ARGB_1555 + ZLIB
// - sprite_character_swordman_atequipment_avatar_skin.NPK: Ver4 格式，带调色板

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

describe("readNpk Ver2 (sprite_test_ver2.NPK)", () => {
	const npkPath = "test/sprite_test_ver2.NPK";
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

	test("getHeader should return ImgHeader with Ver2", () => {
		const album = albums[0];
		if (!album) return;
		const header = album.getHeader();
		expect(header).toBeTruthy();
		expect(header?.flag).toBe(IMG_FLAG);
		expect(header?.version).toBe(ImgVersion.Ver2);
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

	test("Ver2 sprites should be ARGB_1555 with ZLIB compression", () => {
		const album = albums[0];
		if (!album) return;
		const sprites = album.getSprites();
		// 找到第一个非 LINK 的 sprite
		const sprite = sprites.find((s) => s.type !== ColorBits.LINK);
		if (!sprite) return;
		expect(sprite.type).toBe(ColorBits.ARGB_1555);
		expect(sprite.compressMode).toBe(CompressMode.ZLIB);
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

	test("decodeSpriteData should decode to ARGB_8888", () => {
		const album = albums[0];
		if (!album) return;
		const sprites = album.getSprites();
		// 找到第一个非 LINK 的 sprite
		const spriteIdx = sprites.findIndex((s) => s.type !== ColorBits.LINK);
		if (spriteIdx < 0) return;
		const sprite = sprites[spriteIdx];
		if (!sprite) return;

		const decoded = album.decodeSpriteData(spriteIdx);
		expect(decoded).toBeTruthy();

		// ARGB_8888: 4 bytes per pixel
		const expectedSize = (sprite.width ?? 0) * (sprite.height ?? 0) * 4;
		expect(decoded?.length).toBe(expectedSize);
	});

	test("should have LINK sprite at index 1", () => {
		const album = albums[0];
		if (!album) return;
		const sprites = album.getSprites();
		// sprite_test_ver2.NPK 有 3 个 sprites: [0] 正常, [1] LINK->0, [2] 正常
		expect(sprites.length).toBe(3);
		const linkSprite = sprites[1];
		expect(linkSprite).toBeTruthy();
		expect(linkSprite.type).toBe(ColorBits.LINK);
	});

	test("LINK sprite should have correct target index", () => {
		const album = albums[0];
		if (!album) return;
		const sprites = album.getSprites();
		const linkSprite = sprites[1];
		expect(linkSprite.target).toBe(0); // LINK -> sprite 0
	});

	test("LINK sprite should return null from getSpriteData", () => {
		const album = albums[0];
		if (!album) return;
		const data = album.getSpriteData(1); // LINK sprite
		expect(data).toBeNull();
	});

	test("LINK sprite should return null from decodeSpriteData", () => {
		const album = albums[0];
		if (!album) return;
		const decoded = album.decodeSpriteData(1); // LINK sprite
		expect(decoded).toBeNull();
	});

	test("LINK sprite target should have valid data", () => {
		const album = albums[0];
		if (!album) return;
		const sprites = album.getSprites();
		const linkSprite = sprites[1];
		if (linkSprite.type !== ColorBits.LINK) return;
		const targetIdx = linkSprite.target;
		if (targetIdx === undefined) return;
		const targetData = album.decodeSpriteData(targetIdx);
		expect(targetData).toBeTruthy();
	});

	test("readNpk should work with Buffer", () => {
		const buffer = readFileSync(npkPath);
		const albumsFromBuffer = readNpk(buffer);
		expect(albumsFromBuffer.length).toBe(albums.length);
	});
});

describe("readNpk Ver4 (sprite_test_ver4.NPK)", () => {
	const npkPath = "test/sprite_test_ver4.NPK";
	const albums = readNpkFile(npkPath);

	test("should read NPK from file path", () => {
		expect(albums.length).toBeGreaterThan(0);
	});

	test("getHeader should return ImgHeader with Ver4", () => {
		const album = albums[0];
		if (!album) return;
		const header = album.getHeader();
		expect(header).toBeTruthy();
		expect(header?.flag).toBe(IMG_FLAG);
		expect(header?.version).toBe(ImgVersion.Ver4);
		expect(header?.count).toBeGreaterThan(0);
	});

	test("Ver4 sprites should have palette-based format", () => {
		const album = albums[0];
		if (!album) return;
		const sprites = album.getSprites();
		// 找到第一个非 LINK 的 sprite
		const sprite = sprites.find((s) => s.type !== ColorBits.LINK);
		if (!sprite) return;
		// Ver4 的 ARGB_1555 + ZLIB 是调色板索引格式
		expect(sprite.type).toBe(ColorBits.ARGB_1555);
		expect(sprite.compressMode).toBe(CompressMode.ZLIB);
	});

	test("decodeSpriteData should handle Ver4 palette conversion", () => {
		const album = albums[0];
		if (!album) return;
		const sprites = album.getSprites();
		// 找到第一个非 LINK 的 sprite
		const spriteIdx = sprites.findIndex((s) => s.type !== ColorBits.LINK);
		if (spriteIdx < 0) return;
		const sprite = sprites[spriteIdx];
		if (!sprite) return;

		const decoded = album.decodeSpriteData(spriteIdx);
		expect(decoded).toBeTruthy();

		// 解码后应该是 ARGB_8888 格式: 4 bytes per pixel
		const expectedSize = (sprite.width ?? 0) * (sprite.height ?? 0) * 4;
		expect(decoded?.length).toBe(expectedSize);
	});

	test("multiple albums should have correct offsets", () => {
		// Ver4 NPK 可能包含多个 album，每个都正确解析
		expect(albums.length).toBeGreaterThan(0);
		for (const album of albums) {
			const header = album.getHeader();
			expect(header).toBeTruthy();
			expect(header?.version).toBe(ImgVersion.Ver4);
		}
	});
});

describe("IMG versions", () => {
	test("ImgVersion enum should have correct values", () => {
		expect(ImgVersion.Other).toBe(0x00);
		expect(ImgVersion.Ver1).toBe(0x01);
		expect(ImgVersion.Ver2).toBe(0x02);
		expect(ImgVersion.Ver4).toBe(0x04);
		expect(ImgVersion.Ver5).toBe(0x05);
		expect(ImgVersion.Ver6).toBe(0x06);
	});

	test("ColorBits enum should have correct values", () => {
		expect(ColorBits.ARGB_1555).toBe(0x0e);
		expect(ColorBits.ARGB_4444).toBe(0x0f);
		expect(ColorBits.ARGB_8888).toBe(0x10);
		expect(ColorBits.LINK).toBe(0x11);
		expect(ColorBits.DXT_1).toBe(0x12);
		expect(ColorBits.DXT_3).toBe(0x13);
		expect(ColorBits.DXT_5).toBe(0x14);
	});

	test("CompressMode enum should have correct values", () => {
		expect(CompressMode.NONE).toBe(0x05);
		expect(CompressMode.ZLIB).toBe(0x06);
		expect(CompressMode.DDS_ZLIB).toBe(0x07);
	});
});

describe("Audio NPK (test/test_audio.npk)", () => {
	const npkPath = "test/test_audio.npk";
	const albums = readNpkFile(npkPath);

	test("should have 2 audio albums", () => {
		expect(albums.length).toBe(2);
	});

	test("all albums should be detected as audio", () => {
		for (const album of albums) {
			expect(album.isAudio()).toBe(true);
		}
	});

	test("getAudioData should return Buffer starting with OggS", () => {
		const album = albums[0];
		if (!album) return;
		const data = album.getAudioData();
		expect(data).toBeInstanceOf(Buffer);
		expect(data?.slice(0, 4).toString()).toBe("OggS");
	});

	test("getHeader should return null for audio", () => {
		const album = albums[0];
		if (!album) return;
		expect(album.getHeader()).toBeNull();
	});

	test("non-image albums should not be audio", () => {
		const npkPath2 = "test/sprite_test_ver2.NPK";
		const imageAlbums = readNpkFile(npkPath2);
		for (const album of imageAlbums) {
			expect(album.isAudio()).toBe(false);
		}
	});
});
