import { writeFileSync } from "node:fs";
import { createPng } from "../img/png";
import type { SpriteMetadata } from "../img/types";
import { ColorBits } from "../img/types";
import type { NpkAlbum } from "../npk/album";
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
 * @param album NPK album
 * @param spriteIndex sprite 索引
 * @param outputBase 输出目录
 * @param npkFile NPK 文件名
 * @returns boolean
 */
export function extractSprite(
	album: NpkAlbum,
	spriteIndex: number,
	outputBase: string,
	npkFile: string,
): boolean {
	const sprites = album.getSprites();
	const sprite = sprites[spriteIndex];
	if (!sprite) return false;

	// LINK 类型解析为目标 sprite
	const linkTarget = sprite.type === ColorBits.LINK ? sprite.target : undefined;
	const sourceSprite = linkTarget !== undefined ? sprites[linkTarget] : sprite;
	const sourceIndex = linkTarget !== undefined ? linkTarget : spriteIndex;

	if (!sourceSprite) return false;

	const decodedData = album.decodeSpriteData(sourceIndex);
	if (!decodedData) return false;

	const width = sourceSprite.width;
	const height = sourceSprite.height;
	if (!width || !height) return false;

	const relativePath = `${outputBase}/${album.path}/${spriteIndex}.png`;
	ensureDir(relativePath.substring(0, relativePath.lastIndexOf("/")));

	const metadata: SpriteMetadata = {
		x: sourceSprite.x ?? 0,
		y: sourceSprite.y ?? 0,
		frameWidth: sourceSprite.frameWidth ?? 0,
		frameHeight: sourceSprite.frameHeight ?? 0,
		npkFile: npkFile,
		imgName: album.path,
	};

	try {
		const png = createPng(decodedData, width, height, metadata);
		writeFileSync(relativePath, png);
		return true;
	} catch (e) {
		console.log(`  Sprite ${spriteIndex}: PNG save error: ${e}`);
		return false;
	}
}

/**
 * 从 albums 提取所有音频
 */
export function extractAudioFromAlbums(albums: NpkAlbum[]): number {
	const audioAlbums = albums.filter((a) => a.isAudio());

	for (const album of audioAlbums) {
		if (extractAudio(album)) {
			console.log(`  Extracted: ${album.path}`);
		}
	}

	return audioAlbums.length;
}

/**
 * 从 albums 提取所有图片
 */
export function extractSpritesFromAlbums(
	albums: NpkAlbum[],
	outputBase: string,
	npkFile: string,
	skipLinkSprites?: boolean,
): number {
	const imageAlbums = albums.filter((a) => !a.isAudio());

	let savedCount = 0;
	for (const album of imageAlbums) {
		const sprites = album.getSprites();
		for (let i = 0; i < sprites.length; i++) {
			if (skipLinkSprites && sprites[i]?.type === ColorBits.LINK) {
				continue;
			}
			if (extractSprite(album, i, outputBase, npkFile)) {
				savedCount++;
			}
		}
	}

	return savedCount;
}
