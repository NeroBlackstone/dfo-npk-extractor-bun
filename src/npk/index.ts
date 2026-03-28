import { readFileSync } from "node:fs";
import type { NpkAlbum } from "../types/npk";
import { readNpkHeader } from "./reader";

/**
 * NPK文件读取器
 */
export class NpkFile {
	private buffer: Buffer;
	public albums: NpkAlbum[];

	constructor(filePath: string) {
		this.buffer = readFileSync(filePath);
		this.albums = readNpkHeader(this.buffer);
	}

	/**
	 * 获取指定路径的Album数据
	 */
	getAlbumData(path: string): Buffer | null {
		const album = this.albums.find((a) => a.path === path);
		if (!album) {
			return null;
		}
		return this.buffer.subarray(album.offset, album.offset + album.length);
	}

	/**
	 * 获取NPK文件总大小
	 */
	get size(): number {
		return this.buffer.length;
	}
}

export type { NpkAlbum } from "../types/npk";
export { readNpkHeader } from "./reader";
