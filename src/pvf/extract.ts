import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureDir } from "../utils/file";
import { buildStringContext } from "./build-string-context";
import { convertFile } from "./convert-file";
import { isScriptFile } from "./decoders/script-file";
import { convertNameList } from "./name-list";
import { readPvf } from "./reader";
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
export async function extractPvf(options: PvfExtractOptions): Promise<{
	extractedCount: number;
	entries: PvfFileEntry[];
}> {
	const { pvfPath, outputDir } = options;
	console.log(`Reading PVF: ${pvfPath}`);
	const { header, entries, getFileData } = await readPvf(pvfPath);

	console.log(
		`PVF version=${header.fileVersion}, files=${header.numFilesInDirTree}, dirTreeLength=${header.dirTreeLength}`,
	);

	const entryByPath = new Map<string, PvfFileEntry>();
	for (const e of entries) {
		entryByPath.set(e.filePath.toLowerCase(), e);
	}

	const strCtx = await buildStringContext(entryByPath, getFileData);

	let extractedCount = 0;
	for (const entry of entries) {
		const lowerPath = entry.filePath.toLowerCase();

		// 跳过 stringtable.bin
		if (lowerPath === "stringtable.bin") continue;

		// 跳过所有 .lst 文件（name-list 输出 JSON，其余不导出）
		if (lowerPath.endsWith(".lst")) {
			const data = await getFileData(entry);
			if (data.length === 0) continue;
			const json = convertNameList(data, strCtx);
			if (!json) continue;
			const safePath = entry.filePath.replace(/\\/g, "/").replace(/^\//, "");
			const outPath = `${outputDir}/${safePath}.json`;
			ensureDir(dirname(outPath));
			writeFileSync(outPath, json);
			extractedCount++;
			continue;
		}

		const data = await getFileData(entry);
		if (data.length === 0) continue;

		const safePath = entry.filePath.replace(/\\/g, "/").replace(/^\//, "");
		const lowerPath2 = entry.filePath.toLowerCase();
		const isJsonOutput = isScriptFile(data) || lowerPath2.endsWith(".str");
		const outPath = `${outputDir}/${safePath}${isJsonOutput ? ".json" : ""}`;
		ensureDir(dirname(outPath));

		const outputData = convertFile(data, entry.filePath, strCtx);
		writeFileSync(outPath, outputData);
		extractedCount++;
	}

	console.log(`Extracted ${extractedCount} files to ${outputDir}`);
	return { extractedCount, entries };
}
