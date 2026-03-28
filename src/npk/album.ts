import { readImgHeader, readSpriteEntries } from "../img/reader";
import type { ImgHeader, SpriteEntry } from "../img/types";
import { ColorBits } from "../img/types";

/**
 * NPK文件中的单个Album条目
 */
export class NpkAlbum {
	/** IMG文件头 */
	private readonly _header: ImgHeader | null;
	/** 所有Sprite条目 */
	private readonly _sprites: SpriteEntry[];

	/**
	 * @param offset 文件偏移
	 * @param length 文件长度
	 * @param path 解密后的路径
	 * @param data 该Album的数据
	 */
	constructor(
		public readonly offset: number,
		public readonly length: number,
		public readonly path: string,
		private readonly data: Buffer,
	) {
		try {
			this._header = readImgHeader(this.data);
			this._sprites = readSpriteEntries(this.data, this._header);
		} catch {
			this._header = null;
			this._sprites = [];
		}
	}

	/**
	 * 获取原始数据
	 */
	getData(): Buffer {
		return this.data;
	}

	/**
	 * 获取ImgHeader
	 */
	getHeader(): ImgHeader | null {
		return this._header;
	}

	/**
	 * 获取所有Sprite条目
	 */
	getSprites(): SpriteEntry[] {
		return this._sprites;
	}

	/**
	 * 获取Sprite数据
	 */
	getSpriteData(index: number): Buffer | null {
		const sprite = this._sprites[index];
		if (!sprite || !this._header) {
			return null;
		}
		if (sprite.type === ColorBits.LINK) {
			return null;
		}
		const len = sprite.length ?? 0;
		// 计算索引区总大小
		let indexSize = 0;
		for (const s of this._sprites) {
			indexSize += s.type === ColorBits.LINK ? 8 : 36;
		}
		// 数据从 Header(32) + 索引区 之后开始
		const imgData = this.data.subarray(32 + indexSize);
		// 计算该sprite之前的所有非LINK sprite数据长度之和
		let offset = 0;
		for (let i = 0; i < sprite.index; i++) {
			const s = this._sprites[i];
			if (s && s.type !== ColorBits.LINK) {
				offset += s.length ?? 0;
			}
		}
		if (offset + len > imgData.length) {
			return null;
		}
		return imgData.subarray(offset, offset + len);
	}
}
