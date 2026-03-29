import type { ImgHeader } from "../types";
import { ImgVersion } from "../types";
import type { VersionHandler } from "./base";
import { ver2Handler } from "./ver2";
import { ver4Handler } from "./ver4";

/**
 * 根据 IMG 版本获取对应的处理器
 * @param version IMG 版本号
 * @returns 版本处理器
 */
export function getHandler(version: ImgVersion): VersionHandler {
	switch (version) {
		case ImgVersion.Ver1:
		case ImgVersion.Ver2:
		case ImgVersion.Other:
			// Ver1/Ver2 共用同一个处理器
			return ver2Handler;
		case ImgVersion.Ver4:
			return ver4Handler;
		// 其他版本暂未实现，使用 Ver2 处理器
		default:
			return ver2Handler;
	}
}

/**
 * 获取指定版本的 spriteEntriesStart
 * @param header IMG 文件头
 * @param data 完整的 IMG 数据
 */
export function getSpriteEntriesStart(header: ImgHeader, data: Buffer): number {
	const handler = getHandler(header.version);
	return handler.getSpriteEntriesStart(header, data);
}
