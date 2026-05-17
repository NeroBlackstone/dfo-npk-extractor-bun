import { decodeBig5, decodeEucKr } from "../encoding";
import type { PvfStringContext } from "../types";
import { parseBinaryAni } from "./ani-binary";
import { aniDataToJson } from "./ani-json";
import { isScriptFile } from "./script-file";
import { parseScriptFileToJson } from "./script-file-json";
import { convertStrToJsonObject } from "./str-json";

export type ConvertResult = object | Buffer;

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
 * 按优先级排列：扩展名匹配优先于内容检测
 *
 * 1. ScriptFile   — magic 0xD0B0
 * 2. ANI          — .ani 扩展名
 * 3. 文本 content — 首字节 0x23 (#)
 * 4. 文本 .str    — Big5
 * 5. 文本 .txt    — Big5
 * 6. 文本 .nut    — EUC-KR
 */
export const decoders: PvfDecoder[] = [
	{
		name: "script",
		match: (_filePath, data) => isScriptFile(data),
		convert: (data, _filePath, ctx) => parseScriptFileToJson(data, ctx),
	},
	{
		name: "ani",
		match: (filePath) => filePath.endsWith(".ani"),
		convert: (data) => {
			const aniData = parseBinaryAni(data);
			return aniDataToJson(aniData);
		},
	},
	{
		name: "text-content",
		match: (_filePath, data) => data.length > 0 && data[0] === 0x23,
		convert: (data) => ({ content: data.toString("utf-8") }),
	},
	{
		name: "str",
		match: (filePath) => filePath.endsWith(".str"),
		convert: (data) => convertStrToJsonObject(data),
	},
	{
		name: "txt",
		match: (filePath) => filePath.endsWith(".txt"),
		convert: (data) => ({ content: decodeBig5(data) }),
	},
	{
		name: "nut",
		match: (filePath) => filePath.endsWith(".nut"),
		convert: (data) => ({ content: decodeEucKr(data) }),
	},
];
