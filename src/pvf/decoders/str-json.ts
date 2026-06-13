import { decodeAuto, decodeBig5, decodeEucKr, decodeGbk } from "../encoding";

/** .str 文件使用的文本编码 */
export type StrEncoding = "gbk" | "euc-kr" | "big5" | "auto";

/**
 * 从 .str 文件名（已小写）中推断编码
 * .chn.str / .kor.str / .jpn.str 是带语言后缀的翻译表
 *
 * 注意：本仓库的 Script.pvf 中，.kor.str 实际是 BIG5 编码（繁中 base + 韩服注释的混合包），
 *       所以对 .kor.str 使用 auto 检测而不是强制 EUC-KR。
 *
 * @param hint 文件名后缀，例如 ".chn.str"
 */
export function encodingForStrFile(hint: string): StrEncoding {
	const lower = hint.toLowerCase();
	if (lower.endsWith(".chn.str") || lower.endsWith(".chs.str")) return "gbk";
	if (lower.endsWith(".kor.str")) return "auto"; // 实际可能是 BIG5，用 auto 检测
	if (lower.endsWith(".jpn.str")) return "big5"; // 无 Shift-JIS 解码器时回退到 BIG5
	return "big5";
}

/** 根据编码标识调用对应的解码器 */
function decodeByEncoding(data: Buffer, encoding: StrEncoding): string {
	switch (encoding) {
		case "gbk":
			return decodeGbk(data);
		case "euc-kr":
			return decodeEucKr(data);
		case "big5":
			return decodeBig5(data);
		case "auto":
			return decodeAuto(data);
	}
}

/**
 * Convert .str file (Big5/EUC-KR/GBK text) to JSON object.
 * Format: key>value per line, // comments and blank lines are skipped.
 *
 * @param data  原始字节
 * @param encoding  强制使用的编码。"auto" 时走 decodeAuto 启发式
 *                   （对 GBK vs BIG5 完全重叠的常用 CJK 字符不可靠，调用方应优先传具体编码）
 */
export function convertStrToJsonObject(
	data: Buffer,
	encoding: StrEncoding = "auto",
): Record<string, string> {
	const text = decodeByEncoding(data, encoding);
	const obj: Record<string, string> = {};

	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("//")) continue;

		const idx = trimmed.indexOf(">");
		if (idx === -1) continue;

		const key = trimmed.slice(0, idx).trim();
		const value = trimmed.slice(idx + 1).trim();
		if (key) {
			obj[key] = value;
		}
	}

	return obj;
}
