import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureDir } from "../utils/file";
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

	let extractedCount = 0;

	for (const entry of entries) {
		const data = getFileData(entry);
		if (data.length === 0) continue;

		// 构建输出路径
		const safePath = entry.filePath.replace(/\\/g, "/").replace(/^\//, "");
		const outPath = `${outputDir}/${safePath}`;

		ensureDir(dirname(outPath));
		writeFileSync(outPath, data);
		extractedCount++;
	}

	console.log(`Extracted ${extractedCount} files to ${outputDir}`);

	return { extractedCount, entries };
}


