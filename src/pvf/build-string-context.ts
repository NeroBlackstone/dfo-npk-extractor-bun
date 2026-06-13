import { parseNStringLst, parseNStringLstByListId, parseStringTable } from "./string-table";
import type { PvfFileEntry, PvfStringContext } from "./types";

/**
 * 从 PVF 条目中构建字符串上下文
 * 解析 stringtable.bin 和 n_string.lst，返回 PvfStringContext
 */
export async function buildStringContext(
	entryByPath: Map<string, PvfFileEntry>,
	getFileData: (entry: PvfFileEntry) => Promise<Buffer>,
): Promise<PvfStringContext> {
	let stringBinMap: string[] = [];
	const stringStringMap = new Map<string, string>();

	const strTableEntry = entryByPath.get("stringtable.bin");
	if (strTableEntry) {
		const data = await getFileData(strTableEntry);
		if (data.length > 0) {
			stringBinMap = parseStringTable(data);
			console.log(`Parsed stringtable.bin: ${stringBinMap.length} strings`);
		}
	}

	let listIdToFile: Map<number, string> | undefined;
	let translationsByListId: Map<number, Map<string, string>> | undefined;

	const nStringEntry = entryByPath.get("n_string.lst");
	if (nStringEntry && stringBinMap.length > 0) {
		const data = await getFileData(nStringEntry);
		if (data.length > 0) {
			const resolveFile = async (name: string) => {
				// 尝试原始大小写和小写两种 key
				const entry = entryByPath.get(name) ?? entryByPath.get(name.toLowerCase());
				if (!entry) return null;
				const d = await getFileData(entry);
				return d.length > 0 ? d : null;
			};

			const resolved = await parseNStringLst(data, stringBinMap, resolveFile);
			for (const [k, v] of resolved) {
				stringStringMap.set(k, v);
			}
			console.log(`Parsed n_string.lst: ${stringStringMap.size} translations`);

			// 构建 listId 分组的翻译映射（用于 resolveStringLink）
			const byListId = await parseNStringLstByListId(data, stringBinMap, resolveFile);
			listIdToFile = byListId.listIdToFile;
			translationsByListId = byListId.translationsByListId;
			console.log(`Parsed ${listIdToFile.size} listId mappings`);
		}
	}

	return {
		binMap: stringBinMap,
		stringMap: stringStringMap,
		listIdToFile,
		translationsByListId,
	};
}
