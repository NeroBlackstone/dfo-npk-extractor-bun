import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ensureDir } from "../utils/file";
import { buildStringContext } from "./build-string-context";
import { isScriptFile } from "./decoders/script-file";
import { parseScriptFileToJson } from "./decoders/script-file-json";
import { readPvf } from "./reader";
import type { PvfFileEntry, PvfStringContext } from "./types";

export interface ItemListOptions {
	/** PVF 文件路径 */
	pvfPath: string;
	/** 输出文件路径（默认: item-list.csv） */
	outputPath?: string;
	/** 输出目录（默认: output） */
	outputDir?: string;
}

interface ItemInfo {
	id: string;
	type: string;
	name: string;
	name2: string;
	explain: string;
	filePath: string;
}

/**
 * 从文件路径中提取物品 ID
 * 规则：文件名中的数字部分即为物品 ID
 */
function extractItemId(filePath: string): string | null {
	const fileName = filePath.split("/").pop() ?? "";
	// 匹配文件名中的纯数字部分（至少 4 位）
	const match = fileName.match(/(\d{4,})/);
	return match?.[1] ?? null;
}

/**
 * 从文件路径中推断物品类型
 */
function inferItemType(filePath: string): string {
	const lower = filePath.toLowerCase();
	if (lower.startsWith("equipment/")) {
		// equipment/character/class/type/xxx.equ
		const parts = lower.split("/");
		if (parts.length >= 4) {
			return `equipment/${parts[3]}`; // 如 equipment/weapon, equipment/wrist
		}
		return "equipment";
	}
	if (lower.startsWith("stackable/")) {
		// stackable/category/xxx.stk
		const parts = lower.split("/");
		if (parts.length >= 3) {
			return `stackable/${parts[1]}`; // 如 stackable/material, stackable/recipe
		}
		return "stackable";
	}
	if (lower.endsWith(".stk")) return "stackable";
	if (lower.endsWith(".equ")) return "equipment";
	return "unknown";
}

/**
 * 从解析后的 JSON 中提取物品 ID 和名称
 * JSON 结构示例: [{ name: ["@13::name_3035"] }, { name2: ["@13::name2_3035"] }, ...]
 *
 * 物品 ID 可以来自：
 * 1. 文件名中的数字（如 material_3291.stk -> 3291）
 * 2. name 字段的 StringLink 中的 key（如 @13::name_3035 -> 3035）
 */
function extractItemInfoFromJson(
	json: unknown[],
	ctx: PvfStringContext,
	filePath: string,
): { id: string; name: string; name2: string; explain: string } {
	// 先尝试从文件名提取 ID
	let id = extractItemId(filePath);
	let name = "";
	let name2 = "";
	let explain = "";

	for (const item of json) {
		if (typeof item !== "object" || item === null) continue;
		const obj = item as Record<string, unknown>;

		// 提取 name
		if (obj.name && Array.isArray(obj.name) && obj.name.length > 0) {
			const nameVal = obj.name[0];
			if (typeof nameVal === "string") {
				// 尝试从 StringLink 中提取翻译
				const match = nameVal.match(/^@(\d+)::(.+)$/);
				if (match) {
					const [, listIdStr, keyName] = match;
					const listId = Number.parseInt(listIdStr, 10);
					const translations = ctx.translationsByListId?.get(listId);
					name = translations?.get(keyName) ?? keyName;

					// 如果文件名中没有 ID，从 keyName 中提取（如 name_3035 -> 3035）
					if (!id) {
						const idMatch = keyName.match(/^name_(\d+)$/);
						if (idMatch) {
							id = idMatch[1];
						}
					}
				} else {
					name = nameVal;
				}
			}
		}

		// 提取 name2
		if (obj.name2 && Array.isArray(obj.name2) && obj.name2.length > 0) {
			const name2Val = obj.name2[0];
			if (typeof name2Val === "string") {
				const match = name2Val.match(/^@(\d+)::(.+)$/);
				if (match) {
					const [, listIdStr, keyName] = match;
					const listId = Number.parseInt(listIdStr, 10);
					const translations = ctx.translationsByListId?.get(listId);
					name2 = translations?.get(keyName) ?? keyName;
				} else {
					name2 = name2Val;
				}
			}
		}

		// 提取 explain 或 basic_explain
		if (obj.explain && Array.isArray(obj.explain) && obj.explain.length > 0) {
			const explainVal = obj.explain[0];
			if (typeof explainVal === "string") {
				const match = explainVal.match(/^@(\d+)::(.+)$/);
				if (match) {
					const [, listIdStr, keyName] = match;
					const listId = Number.parseInt(listIdStr, 10);
					const translations = ctx.translationsByListId?.get(listId);
					explain = translations?.get(keyName) ?? keyName;
				} else {
					explain = explainVal;
				}
			}
		}

		if (
			obj.basic_explain &&
			Array.isArray(obj.basic_explain) &&
			obj.basic_explain.length > 0
		) {
			const explainVal = obj.basic_explain[0];
			if (typeof explainVal === "string" && !explain) {
				const match = explainVal.match(/^@(\d+)::(.+)$/);
				if (match) {
					const [, listIdStr, keyName] = match;
					const listId = Number.parseInt(listIdStr, 10);
					const translations = ctx.translationsByListId?.get(listId);
					explain = translations?.get(keyName) ?? keyName;
				} else {
					explain = explainVal;
				}
			}
		}
	}

	return { id: id ?? "", name, name2, explain };
}

/**
 * 从 PVF 中提取所有物品 ID 和名称的映射
 */
export async function generateItemList(options: ItemListOptions): Promise<{
	itemCount: number;
	outputPath: string;
}> {
	const { pvfPath, outputPath, outputDir } = options;
	const outPath = outputPath ?? `${outputDir ?? "output"}/item-list.csv`;

	console.log(`Reading PVF: ${pvfPath}`);
	const { entries, getFileData } = await readPvf(pvfPath);

	const entryByPath = new Map<string, PvfFileEntry>();
	for (const e of entries) {
		entryByPath.set(e.filePath.toLowerCase(), e);
	}

	console.log("Building string context...");
	const strCtx = await buildStringContext(entryByPath, getFileData);

	// 收集所有物品文件
	const itemFiles = entries.filter((e) => {
		const lower = e.filePath.toLowerCase();
		return lower.endsWith(".stk") || lower.endsWith(".equ");
	});

	console.log(`Found ${itemFiles.length} item files`);

	// 解析每个物品
	const items: ItemInfo[] = [];
	let processed = 0;

	for (const entry of itemFiles) {
		try {
			const data = await getFileData(entry);
			if (data.length === 0 || !isScriptFile(data)) continue;

			// 解析脚本文件
			const json = parseScriptFileToJson(data, strCtx) as unknown[];

			// 提取物品信息（ID、名称等）
			const { id, name, name2, explain } = extractItemInfoFromJson(
				json,
				strCtx,
				entry.filePath,
			);
			if (!id) continue; // 没有 ID 的物品跳过

			const type = inferItemType(entry.filePath);

			items.push({
				id,
				type,
				name,
				name2,
				explain: explain.slice(0, 100), // 截断过长的描述
				filePath: entry.filePath,
			});
		} catch {
			// 解析失败，跳过
		}

		processed++;
		if (processed % 1000 === 0) {
			console.log(`  Processed ${processed}/${itemFiles.length} items...`);
		}
	}

	console.log(`Parsed ${items.length} items`);

	// 按 ID 排序
	items.sort((a, b) => {
		const numA = Number.parseInt(a.id, 10);
		const numB = Number.parseInt(b.id, 10);
		if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
			return numA - numB;
		}
		return a.id.localeCompare(b.id);
	});

	// 生成 CSV
	const csvHeader = "id,type,name,name2,explain,filePath";
	const csvRows = items.map((item) => {
		const escapeCsv = (s: string) => {
			if (s.includes(",") || s.includes('"') || s.includes("\n")) {
				return `"${s.replace(/"/g, '""')}"`;
			}
			return s;
		};
		return [
			item.id,
			escapeCsv(item.type),
			escapeCsv(item.name),
			escapeCsv(item.name2),
			escapeCsv(item.explain),
			escapeCsv(item.filePath),
		].join(",");
	});

	const csvContent = [csvHeader, ...csvRows].join("\n");

	// 确保输出目录存在
	const outDir = dirname(outPath);
	await ensureDir(outDir);

	// 写入文件
	await writeFile(outPath, csvContent, "utf-8");
	console.log(`Wrote ${items.length} items to ${outPath}`);

	return { itemCount: items.length, outputPath: outPath };
}
