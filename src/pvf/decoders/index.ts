import { decodeBig5, decodeEucKr } from "../encoding";
import type { PvfStringContext } from "../types";
import { parseBinaryAni } from "./ani-binary";
import { serializeAniToJson } from "./ani-json";
import { isScriptFile } from "./script-file";
import { parseScriptFileToJson } from "./script-file-json";
import { convertStrToJson } from "./str-json";

export type ConvertResult = string | Buffer;

export interface PvfDecoder {
	name: string;
	match: (filePath: string, data: Buffer, ctx: PvfStringContext) => boolean;
	convert: (
		data: Buffer,
		filePath: string,
		ctx: PvfStringContext,
	) => ConvertResult;
}

/**
 * 解码器路由表
 * 按优先级排列：magic number 检测优先于扩展名匹配
 *
 * 1. ScriptFile   — magic 0xD0B0
 * 2. 文本 content — 首字节 0x23 (#)
 * 3. ANI          — .ani 扩展名
 * 4. 文本 .str    — Big5
 * 5. 文本 .txt    — Big5
 * 6. 文本 .nut    — EUC-KR
 */
export const decoders: PvfDecoder[] = [
	{
		name: "script",
		match: (_filePath, data) => isScriptFile(data),
		convert: (data, _filePath, ctx) =>
			JSON.stringify(parseScriptFileToJson(data, ctx), null, 2),
	},
	{
		name: "text-content",
		match: (_filePath, data) => data.length > 0 && data[0] === 0x23,
		convert: (data) => data.toString("utf-8"),
	},
	{
		name: "ani",
		match: (filePath) => filePath.endsWith(".ani"),
		convert: (data) => {
			const aniData = parseBinaryAni(data);
			return serializeAniToJson(aniData);
		},
	},
	{
		name: "str",
		match: (filePath) => filePath.endsWith(".str"),
		convert: (data) => convertStrToJson(data),
	},
	{
		name: "txt",
		match: (filePath) => filePath.endsWith(".txt"),
		convert: (data) => decodeBig5(data),
	},
	{
		name: "nut",
		match: (filePath) => filePath.endsWith(".nut"),
		convert: (data) => decodeEucKr(data),
	},
];
