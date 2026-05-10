import { decodeBig5, decodeEucKr } from "../encoding";
import type { PvfStringContext } from "../types";
import { parseBinaryAni } from "./ani-binary";
import { serializeAniToText } from "./ani-text";
import { parseDocument } from "./document";
import { serializeDocumentToText } from "./document-text";
import { decompileScriptFile, isScriptFile } from "./script-file";

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

export const decoders: PvfDecoder[] = [
	{
		name: "ani",
		match: (filePath) => filePath.endsWith(".ani"),
		convert: (data) => {
			const aniData = parseBinaryAni(data);
			return serializeAniToText(aniData);
		},
	},
	{
		name: "str",
		match: (filePath) => filePath.endsWith(".str"),
		convert: (data) => decodeBig5(data),
	},
	{
		name: "nut",
		match: (filePath) => filePath.endsWith(".nut"),
		convert: (data) => decodeEucKr(data),
	},
	{
		name: "script",
		match: (_filePath, data) => data.length > 7 && isScriptFile(data),
		convert: (data, _filePath, ctx) => decompileScriptFile(data, ctx),
	},
	{
		name: "document",
		match: (_filePath, data) => data.length > 7,
		convert: (data, _filePath, ctx) => {
			const docTree = parseDocument(data, ctx);
			return serializeDocumentToText(docTree);
		},
	},
];
