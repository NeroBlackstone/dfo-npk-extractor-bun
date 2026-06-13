import { dirname } from "node:path";
import { ensureDir } from "../utils/file";
import { buildStringContext } from "./build-string-context";
import { convertFile } from "./convert-file";
import type { ConvertResult } from "./decoders";
import { isScriptFile } from "./decoders/script-file";
import { convertNameList } from "./name-list";
import { readPvf } from "./reader";
import type { PvfFileEntry } from "./types";

export interface PvfExtractOptions {
	/** PVF 文件路径 */
	pvfPath: string;
	/** 输出目录 */
	outputDir: string;
	/** 是否将 StringLink 解析为实际翻译文本 */
	resolveStringLink?: boolean;
}

/** 并发处理上限 */
const CONCURRENCY = 64;

/**
 * 提取单个 PVF 文件
 */
export async function extractPvf(options: PvfExtractOptions): Promise<{
	extractedCount: number;
	entries: PvfFileEntry[];
}> {
	const { pvfPath, outputDir, resolveStringLink = false } = options;
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

	if (resolveStringLink) {
		console.log(`StringLink resolution enabled: will resolve @listId::key to actual translations`);
	}

	// 预先创建所有需要的目录
	const dirsToCreate = new Set<string>();
	dirsToCreate.add(outputDir);
	for (const entry of entries) {
		const safePath = entry.filePath.replace(/\\/g, "/").replace(/^\//, "");
		dirsToCreate.add(dirname(`${outputDir}/${safePath}`));
	}
	for (const dir of dirsToCreate) {
		ensureDir(dir);
	}

	let extractedCount = 0;

	async function processEntry(entry: PvfFileEntry): Promise<{
		path: string;
		data: ConvertResult;
	} | null> {
		const lowerPath = entry.filePath.toLowerCase();

		// 跳过 stringtable.bin
		if (lowerPath === "stringtable.bin") return null;

		// 跳过所有 .lst 文件（name-list 输出 JSON，其余不导出）
		if (lowerPath.endsWith(".lst")) {
			const data = await getFileData(entry);
			if (data.length === 0) return null;
			const obj = convertNameList(data, strCtx);
			if (!obj) return null;
			const safePath = entry.filePath.replace(/\\/g, "/").replace(/^\//, "");
			return { path: `${outputDir}/${safePath}.json`, data: obj };
		}

		const data = await getFileData(entry);
		if (data.length === 0) return null;

		const safePath = entry.filePath.replace(/\\/g, "/").replace(/^\//, "");
		const lowerPath2 = entry.filePath.toLowerCase();
		const isJsonOutput =
			isScriptFile(data) ||
			lowerPath2.endsWith(".str") ||
			lowerPath2.endsWith(".ani");
		const outPath = `${outputDir}/${safePath}${isJsonOutput ? ".json" : ""}`;

		const outputData = convertFile(data, entry.filePath, strCtx, { resolveStringLink });
		return { path: outPath, data: outputData };
	}

	// 分块并发处理
	const pending: Array<{ path: string; data: ConvertResult }> = [];
	for (let i = 0; i < entries.length; i += CONCURRENCY) {
		const chunk = entries.slice(i, i + CONCURRENCY);
		const results = await Promise.all(chunk.map((e) => processEntry(e)));
		for (const r of results) {
			if (r) {
				pending.push(r);
				extractedCount++;
			}
		}
	}

	// 批量 JSON.stringify + 写入
	await Promise.all(
		pending.map((p) =>
			Bun.write(
				p.path,
				typeof p.data === "object" ? JSON.stringify(p.data, null, 2) : p.data,
			),
		),
	);

	console.log(`Extracted ${extractedCount} files to ${outputDir}`);
	return { extractedCount, entries };
}
