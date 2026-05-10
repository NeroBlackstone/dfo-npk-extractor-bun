import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureDir } from "../utils/file";
import { parseBinaryAni } from "./ani-binary";
import { serializeAniToText } from "./ani-text";
import { BufferReader } from "./buffer-reader";
import { parseDocument } from "./document";
import { serializeDocumentToText } from "./document-text";
import { readPvf } from "./reader";
import { decompileScriptFile, isScriptFile } from "./script-file";
import {
	decodeBig5,
	decodeEucKr,
	parseStrContent,
	parseStringTable,
} from "./string-table";
import type { PvfFileEntry } from "./types";

export interface PvfExtractOptions {
	/** PVF 文件路径 */
	pvfPath: string;
	/** 输出目录 */
	outputDir: string;
}

/**
 * 提取单个 PVF 文件
 */
export function extractPvf(options: PvfExtractOptions): {
	extractedCount: number;
	entries: PvfFileEntry[];
} {
	const { pvfPath, outputDir } = options;
	console.log(`Reading PVF: ${pvfPath}`);
	const buffer = readFileSync(pvfPath);
	const { header, entries, getFileData } = readPvf(buffer);

	console.log(
		`PVF version=${header.fileVersion}, files=${header.numFilesInDirTree}, dirTreeLength=${header.dirTreeLength}`,
	);

	// 构建路径索引，避免 O(N*M) 线性查找
	const entryByPath = new Map<string, PvfFileEntry>();
	for (const e of entries) {
		entryByPath.set(e.filePath.toLowerCase(), e);
	}

	// 第一遍：提取 stringtable.bin 和 n_string.lst 构建字符串表
	let stringBinMap: string[] = [];
	const stringStringMap = new Map<string, string>();

	const strTableEntry = entryByPath.get("stringtable.bin");
	if (strTableEntry) {
		const data = getFileData(strTableEntry);
		if (data.length > 0) {
			stringBinMap = parseStringTable(data);
			console.log(`Parsed stringtable.bin: ${stringBinMap.length} strings`);
		}
	}

	const nStringEntry = entryByPath.get("n_string.lst");
	if (nStringEntry && stringBinMap.length > 0) {
		const data = getFileData(nStringEntry);
		if (data.length > 0) {
			// 解析 n_string.lst 获取 .str 文件列表，然后逐个解析 key>value
			const reader = new BufferReader(data);
			const magicNumber = reader.readUint16();
			if (magicNumber === 53424) {
				while (reader.getRemaining() >= 10) {
					// 跳过 6 字节
					for (let k = 0; k < 6; k++) reader.readUint8();
					const index = reader.readInt32();
					if (index >= 0 && index < stringBinMap.length) {
						const strFileName = stringBinMap[index];
						if (!strFileName) continue;
						const strEntry = entryByPath.get(strFileName);
						if (strEntry) {
							const strData = getFileData(strEntry);
							if (strData.length > 0) {
								const content = decodeBig5(strData);
								const kvMap = parseStrContent(content);
								for (const [k, v] of kvMap) {
									stringStringMap.set(k, v);
								}
							}
						}
					}
				}
			}
			console.log(`Parsed n_string.lst: ${stringStringMap.size} translations`);
		}
	}

	// 第二遍：提取并转换所有文件
	let extractedCount = 0;

	for (const entry of entries) {
		const data = getFileData(entry);
		if (data.length === 0) continue;

		const safePath = entry.filePath.replace(/\\/g, "/").replace(/^\//, "");
		const outPath = `${outputDir}/${safePath}`;

		ensureDir(dirname(outPath));

		const lowerPath = entry.filePath.toLowerCase();
		let outputData: string | Buffer = data;

		if (lowerPath.endsWith(".ani")) {
			// 动画文件：二进制 → 文本
			try {
				const aniData = parseBinaryAni(data);
				outputData = serializeAniToText(aniData);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.warn(`Failed to parse .ani: ${entry.filePath} - ${msg}`);
				outputData = data;
			}
		} else if (lowerPath.endsWith(".str")) {
			// 文本文件：BIG5 → UTF-8
			outputData = decodeBig5(data);
		} else if (lowerPath.endsWith(".nut")) {
			// Squirrel 脚本：EUC-KR → UTF-8
			outputData = decodeEucKr(data);
		} else if (
			lowerPath !== "stringtable.bin" &&
			lowerPath !== "n_string.lst" &&
			data.length > 7
		) {
			if (isScriptFile(data)) {
				// ScriptFile（.ai, .skl, .stk 等）：反编译
				try {
					outputData = decompileScriptFile(data, stringBinMap, stringStringMap);
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					console.warn(
						`Failed to decompile script: ${entry.filePath} - ${msg}, writing raw`,
					);
					outputData = data;
				}
			} else {
				// 其他文件：尝试 Document 二进制 → 文本
				try {
					const docTree = parseDocument(data, stringBinMap, stringStringMap);
					outputData = serializeDocumentToText(docTree);
				} catch {
					console.warn(
						`Failed to parse document: ${entry.filePath}, writing raw`,
					);
					outputData = data;
				}
			}
		}

		writeFileSync(outPath, outputData);
		extractedCount++;
	}

	console.log(`Extracted ${extractedCount} files to ${outputDir}`);

	return { extractedCount, entries };
}
