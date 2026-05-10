// Bun 的 @types/bun 将 TextDecoder 编码限制为 Bun.Encoding（仅 utf-8/windows-1252/utf-16），
// 但运行时支持 WHATWG 标准编码包括 big5。这里用 as any 桥接类型差异。
const big5Decoder = new TextDecoder("big5" as any);
const eucKrDecoder = new TextDecoder("euc-kr" as any);

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
