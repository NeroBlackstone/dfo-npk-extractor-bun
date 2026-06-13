// Bun 的 @types/bun 将 TextDecoder 编码限制为 Bun.Encoding（仅 utf-8/windows-1252/utf-16），
// 但运行时支持 WHATWG 标准编码包括 big5/gbk/euc-kr。这里用 as any 桥接类型差异。
const big5Decoder = new TextDecoder("big5" as any);
const eucKrDecoder = new TextDecoder("euc-kr" as any);
const gbkDecoder = new TextDecoder("gbk" as any);

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

/**
 * 将 buffer 数据用 GBK 编码解码为 UTF-8 文本
 * 简中版 .str 文件使用 GBK 编码
 */
export function decodeGbk(data: Buffer): string {
	return gbkDecoder.decode(data);
}

/** CJK 统一表意文字范围（中文 / Hanja / 日文汉字） */
const CJK_UNIFIED_START = 0x4e00;
const CJK_UNIFIED_END = 0x9fff;
/** 韩文音节范围 */
const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7af;

interface DecodeStats {
	/** U+FFFD 替换字符数（越少越好） */
	bad: number;
	/** CJK 统一表意文字数（中文 / Hanja） */
	cjk: number;
	/** 韩文音节数 */
	hangul: number;
}

function analyze(s: string): DecodeStats {
	let bad = 0;
	let cjk = 0;
	let hangul = 0;
	for (let i = 0; i < s.length; i++) {
		const cp = s.charCodeAt(i);
		if (cp === 0xfffd) bad++;
		else if (cp >= CJK_UNIFIED_START && cp <= CJK_UNIFIED_END) cjk++;
		else if (cp >= HANGUL_START && cp <= HANGUL_END) hangul++;
	}
	return { bad, cjk, hangul };
}

/**
 * 自动检测编码并解码 buffer 为 UTF-8 文本
 *
 * 候选编码：GBK（简中）、EUC-KR / CP949（韩文）、BIG5（繁中）。
 *
 * 选优策略（按优先级）：
 *   1. 替换字符（U+FFFD）最少的胜出 —— 字节序列无效越多越不匹配
 *   2. 平局时，韩文音节多的胜出 —— 区分 GBK 与 EUC-KR 的关键：
 *      GBK 是 EUC-KR 字节集的超集，EUC-KR 的韩文字节对在 GBK 里通常被解为 CJK 汉字
 *      而非韩文音节，所以"含韩文音节"是 EUC-KR 的强信号
 *   3. 还平局时，CJK 统一表意文字多的胜出 —— 区分 GBK 与 BIG5：
 *      BIG5 扩展字符在 GBK 里常被解为片假名 / 平假名 / 其他符号而非 CJK
 *   4. 最终平局默认 GBK（覆盖最广的简体中文字符集，也是当前 DFO 主流）
 *
 * 为什么旧实现会出错：旧实现只看"是否含韩文音节"区分 EUC-KR 与 BIG5，
 * 但碰到 GBK 简中文件时，GBK 的高字节与 CP949 重叠会凑出"看起来像韩文"
 * 的字节对，于是错判为 EUC-KR，剩余 GBK 专有字节全部变成 �。
 */
export function decodeAuto(data: Buffer): string {
	const gbkResult = gbkDecoder.decode(data);
	const eucKrResult = eucKrDecoder.decode(data);
	const big5Result = big5Decoder.decode(data);

	const g = analyze(gbkResult);
	const e = analyze(eucKrResult);
	const b = analyze(big5Result);

	// 1. 替换字符最少
	const minBad = Math.min(g.bad, e.bad, b.bad);
	const candidates: Array<{ stats: DecodeStats; text: string }> = [];
	if (g.bad === minBad) candidates.push({ stats: g, text: gbkResult });
	if (e.bad === minBad) candidates.push({ stats: e, text: eucKrResult });
	if (b.bad === minBad) candidates.push({ stats: b, text: big5Result });

	// 2. 韩文音节最多
	const maxHangul = Math.max(...candidates.map((c) => c.stats.hangul));
	if (maxHangul > 0) {
		const hangulWinners = candidates.filter(
			(c) => c.stats.hangul === maxHangul,
		);
		if (hangulWinners.length === 1) return hangulWinners[0]!.text;
		return hangulWinners[0]!.text;
	}

	// 3. CJK 统一表意文字最多
	const maxCjk = Math.max(...candidates.map((c) => c.stats.cjk));
	const cjkWinners = candidates.filter((c) => c.stats.cjk === maxCjk);
	if (cjkWinners.length === 1) return cjkWinners[0]!.text;

	// 4. 默认 GBK
	return gbkResult;
}
