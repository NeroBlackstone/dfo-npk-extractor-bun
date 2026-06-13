import { decodeBig5, decodeEucKr } from "../encoding";
import type { ConvertFileOptions } from "../convert-file";
import type { PvfStringContext } from "../types";
import { parseBinaryAni } from "./ani-binary";
import { aniDataToJson } from "./ani-json";
import { isScriptFile } from "./script-file";
import { parseScriptFileToJson } from "./script-file-json";
import { convertStrToJsonObject, encodingForStrFile } from "./str-json";

export type ConvertResult = object | Buffer;

export interface PvfDecoder {
	name: string;
	match: (filePath: string, data: Buffer, ctx: PvfStringContext) => boolean;
	convert: (
		data: Buffer,
		filePath: string,
		ctx: PvfStringContext,
		options?: ConvertFileOptions,
	) => ConvertResult;
}

/**
 * 解码器路由表
 * 按优先级排列：扩展名匹配优先于内容检测
 *
 * 1. ScriptFile   — magic 0xD0B0
 * 2. ANI          — .ani 扩展名
 * 3. 文本 content — 首字节 0x23 (#)
 * 4. 文本 .chn.str / .kor.str / .jpn.str — 按语言后缀选 GBK / EUC-KR / BIG5
 * 5. 文本 .str    — Big5（默认）
 * 6. 文本 .txt    — Big5
 * 7. 文本 .nut    — EUC-KR
 */
export const decoders: PvfDecoder[] = [
	{
		name: "script",
		match: (_filePath, data) => isScriptFile(data),
		convert: (data, _filePath, ctx, options) =>
			parseScriptFileToJson(data, ctx, {
				resolveStringLink: options?.resolveStringLink,
			}),
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
		// 带语言后缀的 .str 在通用 .str 之前，按 .chn / .kor / .jpn 后缀选编码
		// 避免对 GBK 简中 .str 走 BIG5 兜底产生 �
		name: "str-lang",
		match: (filePath) =>
			filePath.endsWith(".chn.str") ||
			filePath.endsWith(".chs.str") ||
			filePath.endsWith(".kor.str") ||
			filePath.endsWith(".jpn.str"),
		convert: (data, filePath) =>
			convertStrToJsonObject(data, encodingForStrFile(filePath)),
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
