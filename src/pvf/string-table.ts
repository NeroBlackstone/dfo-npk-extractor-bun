import { BufferReader } from "./buffer-reader";
import { decodeAuto } from "./encoding";

/**
 * 解析 stringtable.bin，构建字符串数组
 * C++ 参考: PvfReader::unpackStringTable()
 */
export function parseStringTable(data: Buffer): string[] {
	/** stringtable.bin 文件头 offset 数组占用的字节数（count + count+1 个 4 字节索引） */
	const STRING_TABLE_HEADER_SIZE = 4;
	if (data.length < STRING_TABLE_HEADER_SIZE) return [];

	const reader = new BufferReader(data);
	const count = reader.readInt32();

	// C++ 使用随机访问: startPos[i] = read(buffer, i*4+4), endPos[i] = read(buffer, i*4+8)
	// 偏移表有 count+1 个条目，每个 4 字节
	const offsets: number[] = new Array(count + 1);
	for (let i = 0; i <= count; i++) {
		offsets[i] = reader.readInt32();
	}

	const map: string[] = new Array(count);

	for (let i = 0; i < count; i++) {
		const startPos = offsets[i] ?? 0;
		const endPos = offsets[i + 1] ?? 0;
		const len = endPos - startPos;
		if (len <= 0) {
			map[i] = "";
			continue;
		}

		const strStart = startPos + STRING_TABLE_HEADER_SIZE;
		const strBytes = data.subarray(strStart, strStart + len);
		const decoded = decodeAuto(strBytes);
		const trimmed = decoded.trim();
		// 如果首尾没有空格，说明本来就不需要 lowerCase
		map[i] = trimmed === decoded ? trimmed : trimmed.toLowerCase();
	}

	return map;
}

/**
 * 解析 .str 文件内容为 key>value 映射
 * C++ 参考: PvfReader::unpackStringTable() 中的 key>value 解析
 */
export function parseStrContent(content: string): Map<string, string> {
	const map = new Map<string, string>();
	const lines = content.split(/\r?\n/);
	for (const line of lines) {
		const pos = line.indexOf(">");
		if (pos > 0) {
			const key = line.substring(0, pos);
			const val = line.substring(pos + 1);
			map.set(key, val);
		}
	}
	return map;
}

const N_STRING_MAGIC = 53424;
/** 每条记录固定 10 字节: [6 bytes padding][4 bytes index] */
const N_STRING_ENTRY_SIZE = 10;
/** n_string.lst 文件头 magic number 的字节数 */
const N_STRING_MAGIC_SIZE = 2;
/** n_string.lst 每条记录跳过 magic 后的 header 字节数（不含 index） */
const N_STRING_RECORD_HEADER_SIZE = 6;

/**
 * 解析 n_string.lst，通过 stringBinMap 索引查找 .str 文件并解析 key>value 翻译
 * @param data n_string.lst 的原始数据
 * @param stringBinMap stringtable.bin 解析后的字符串数组
 * @param resolveFile 根据文件名获取文件数据的回调，找不到返回 null
 */
export async function parseNStringLst(
	data: Buffer,
	stringBinMap: string[],
	resolveFile: (name: string) => Promise<Buffer | null>,
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	if (data.length < N_STRING_MAGIC_SIZE) return result;

	const reader = new BufferReader(data);
	const magicNumber = reader.readUint16();
	if (magicNumber !== N_STRING_MAGIC) return result;

	// 收集所有 index，收集完再去重
	const indices: number[] = [];
	while (reader.getRemaining() >= N_STRING_ENTRY_SIZE) {
		reader.setOffset(reader.getOffset() + N_STRING_RECORD_HEADER_SIZE); // skip padding bytes
		const index = reader.readInt32();
		if (index >= 0 && index < stringBinMap.length) {
			indices.push(index);
		}
	}

	// 按 index 去重文件名
	const uniqueIndices = [...new Set(indices)];
	const fileNames = uniqueIndices
		.map((i) => stringBinMap[i] ?? "")
		.filter(Boolean);

	// 并发读取所有 .str 文件
	const CONCURRENCY = 64;
	const fileDataMap = new Map<string, Buffer | null>();
	for (let i = 0; i < fileNames.length; i += CONCURRENCY) {
		const chunk = fileNames.slice(i, i + CONCURRENCY);
		const dataList = await Promise.all(chunk.map((name) => resolveFile(name)));
		for (let j = 0; j < chunk.length; j++) {
			const name = chunk[j];
			if (name !== undefined) {
				fileDataMap.set(name, dataList[j] ?? null);
			}
		}
	}

	// 再次遍历解析内容（使用已缓存的数据）
	reader.setOffset(N_STRING_MAGIC_SIZE);
	while (reader.getRemaining() >= N_STRING_ENTRY_SIZE) {
		reader.setOffset(reader.getOffset() + N_STRING_RECORD_HEADER_SIZE); // skip padding bytes
		const index = reader.readInt32();
		if (index < 0 || index >= stringBinMap.length) continue;
		const strFileName = stringBinMap[index];
		if (!strFileName) continue;
		const fileData = fileDataMap.get(strFileName);
		if (!fileData || fileData.length === 0) continue;
		const content = decodeAuto(fileData);
		const kvMap = parseStrContent(content);
		for (const [k, v] of kvMap) {
			result.set(k, v);
		}
	}

	return result;
}
