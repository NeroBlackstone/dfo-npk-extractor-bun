import { BufferReader } from "./buffer-reader";

// Bun 的 @types/bun 将 TextDecoder 编码限制为 Bun.Encoding（仅 utf-8/windows-1252/utf-16），
// 但运行时支持 WHATWG 标准编码包括 big5。这里用 as any 桥接类型差异。
const big5Decoder = new TextDecoder("big5" as any);
const eucKrDecoder = new TextDecoder("euc-kr" as any);

/**
 * 解析 stringtable.bin，构建字符串数组
 * C++ 参考: PvfReader::unpackStringTable()
 */
export function parseStringTable(data: Buffer): string[] {
	if (data.length < 4) return [];

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

		const strStart = startPos + 4;
		const strBytes = data.subarray(strStart, strStart + len);
		const str = big5Decoder.decode(strBytes).toLowerCase().trim();
		map[i] = str;
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

/**
 * 将 buffer 数据用 BIG5 编码解码为 UTF-8 文本
 */
export function decodeBig5(data: Buffer): string {
	return big5Decoder.decode(data);
}

/**
 * 将 buffer 数据用 EUC-KR 编码解码为 UTF-8 文本
 * .nut 等脚本文件使用 EUC-KR（CP949）编码
 */
export function decodeEucKr(data: Buffer): string {
	return eucKrDecoder.decode(data);
}

const N_STRING_MAGIC = 53424;

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
	if (data.length < 2) return result;

	const reader = new BufferReader(data);
	const magicNumber = reader.readUint16();
	if (magicNumber !== N_STRING_MAGIC) return result;

	while (reader.getRemaining() >= 10) {
		for (let k = 0; k < 6; k++) reader.readUint8();
		const index = reader.readInt32();
		if (index < 0 || index >= stringBinMap.length) continue;
		const strFileName = stringBinMap[index];
		if (!strFileName) continue;
		const fileData = await resolveFile(strFileName);
		if (!fileData || fileData.length === 0) continue;
		const content = decodeBig5(fileData);
		const kvMap = parseStrContent(content);
		for (const [k, v] of kvMap) {
			result.set(k, v);
		}
	}

	return result;
}
