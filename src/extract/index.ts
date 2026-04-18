import { writeFileSync } from "node:fs";
import { createPng } from "../img/png";
import type { NpkAlbum } from "../npk/album";
import { readNpkFile } from "../npk/index";
import { ensureDir } from "../utils/file";

/**
 * 提取单个音频文件
 */
export function extractAudio(album: NpkAlbum): boolean {
	const audioData = album.getAudioData();
	if (!audioData) return false;

	ensureDir(album.path.substring(0, album.path.lastIndexOf("/")));
	writeFileSync(album.path, audioData);
	return true;
}

/**
 * 提取单个图片 Sprite
 */
export function extractSprite(
	album: NpkAlbum,
	spriteIndex: number,
	outputBase: string,
): boolean {
	const sprites = album.getSprites();
	const sprite = sprites[spriteIndex];
	if (!sprite) return false;

	// Skip LINK type
	if (sprite.type === 0x11) return false;

	const decodedData = album.decodeSpriteData(spriteIndex);
	if (!decodedData) return false;

	const width = sprite.width;
	const height = sprite.height;
	if (!width || !height) return false;

	const relativePath = `${outputBase}/${album.path}/${spriteIndex}.png`;
	ensureDir(relativePath.substring(0, relativePath.lastIndexOf("/")));

	try {
		const png = createPng(decodedData, width, height);
		writeFileSync(relativePath, png);
		return true;
	} catch (e) {
		console.log(`  Sprite ${spriteIndex}: PNG save error: ${e}`);
		return false;
	}
}

/**
 * 从 NPK 提取所有音频
 */
export function extractAudioFromNpk(npkPath: string): number {
	const albums = readNpkFile(npkPath);
	const audioAlbums = albums.filter((a) => a.isAudio());

	for (const album of audioAlbums) {
		if (extractAudio(album)) {
			console.log(`  Extracted: ${album.path}`);
		}
	}

	return audioAlbums.length;
}

/**
 * 从 NPK 提取所有图片
 */
export function extractSpritesFromNpk(
	npkPath: string,
	outputBase: string,
): number {
	const albums = readNpkFile(npkPath);
	const imageAlbums = albums.filter((a) => !a.isAudio());

	let savedCount = 0;
	for (const album of imageAlbums) {
		const sprites = album.getSprites();
		for (let i = 0; i < sprites.length; i++) {
			if (extractSprite(album, i, outputBase)) {
				savedCount++;
			}
		}
	}

	return savedCount;
}
