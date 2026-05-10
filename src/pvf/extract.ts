import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureDir } from "../utils/file";
import { buildStringContext } from "./build-string-context";
import { convertFile } from "./convert-file";
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
		const data = await getFileData(entry);
		if (data.length === 0) continue;

		const safePath = entry.filePath.replace(/\\/g, "/").replace(/^\//, "");
		const outPath = `${outputDir}/${safePath}`;
		ensureDir(dirname(outPath));

		const outputData = convertFile(data, entry.filePath, strCtx);
		writeFileSync(outPath, outputData);
		extractedCount++;
	}

	console.log(`Extracted ${extractedCount} files to ${outputDir}`);
	return { extractedCount, entries };
}
