import { readImgHeader, readSpriteEntries } from "../img/reader";
import type { SpriteEntry } from "../img/types";
import { ColorBits, CompressMode } from "../img/types";
import { getHandler, getSpriteEntriesStart } from "../img/versions";

/**
 * NPK文件中的单个Album条目
 */
export class NpkAlbum {
	/** IMG文件头 */
	private readonly _header;
	/** 所有Sprite条目 */
	private readonly _sprites: SpriteEntry[];
	/** 版本处理器 */
	private readonly _handler;
	/** 原始数据 */
	private readonly _data;

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
		data: Buffer,
	) {
		this._data = data;
		try {
			this._header = readImgHeader(data);
			this._handler = getHandler(this._header.version);

			this._sprites = readSpriteEntries(
				data,
				this._header,
				getSpriteEntriesStart(this._header, data),
			);
		} catch {
			this._header = null;
			this._sprites = [];
			this._handler = null;
		}
	}

	/**
	 * 获取原始数据
	 */
	getData(): Buffer {
		return this._data;
	}

	/**
	 * 获取ImgHeader
	 */
	getHeader() {
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

		// 数据区域从 sprite 条目之后开始
		const spriteEntriesStart = getSpriteEntriesStart(this._header, this._data);
		const dataStart = spriteEntriesStart + this._header.indexLength;
		const imgData = this._data.subarray(dataStart);

		// 计算该sprite之前的所有非LINK sprite数据偏移
		let offset = 0;
		for (let i = 0; i < sprite.index; i++) {
			const s = this._sprites[i];
			if (s && s.type !== ColorBits.LINK) {
				if (s.compressMode === CompressMode.NONE) {
					const bytesPerPixel = s.type === ColorBits.ARGB_8888 ? 4 : 2;
					offset += (s.width ?? 0) * (s.height ?? 0) * bytesPerPixel;
				} else {
					offset += s.length ?? 0;
				}
			}
		}

		// 计算该sprite的数据长度
		let len: number;
		if (sprite.compressMode === CompressMode.NONE) {
			const bytesPerPixel = sprite.type === ColorBits.ARGB_8888 ? 4 : 2;
			len = (sprite.width ?? 0) * (sprite.height ?? 0) * bytesPerPixel;
		} else {
			len = sprite.length ?? 0;
		}

		if (offset + len > imgData.length) {
			return null;
		}
		return imgData.subarray(offset, offset + len);
	}

	/**
	 * 解码Sprite数据
	 */
	decodeSpriteData(index: number): Buffer | null {
		const sprite = this._sprites[index];
		if (!sprite || !this._handler) {
			return null;
		}
		const rawData = this.getSpriteData(index);
		if (!rawData) {
			return null;
		}

		const palette = this._handler.readPalette(this._data);
		return this._handler.decodeSprite(sprite, rawData, palette);
	}

	/**
	 * 检测是否为音频文件（.ogg 扩展名）
	 */
	isAudio(): boolean {
		return this.path.toLowerCase().endsWith(".ogg");
	}

	/**
	 * 获取音频数据（原始 .ogg 字节）
	 */
	getAudioData(): Buffer | null {
		if (!this.isAudio()) return null;
		return this._data;
	}
}
