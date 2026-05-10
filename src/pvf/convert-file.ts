import { decoders } from "./decoders";
import type { PvfStringContext } from "./types";

const SKIPPED = new Set(["stringtable.bin", "n_string.lst"]);

/**
 * 将 PVF 文件数据从二进制格式转换为文本格式
 * 纯函数：不做 I/O，转换失败时返回原始 buffer
 */
export function convertFile(
	data: Buffer,
	filePath: string,
	ctx: PvfStringContext,
): string | Buffer {
	const lowerPath = filePath.toLowerCase();

	if (SKIPPED.has(lowerPath)) {
		return data;
	}

	for (const decoder of decoders) {
		if (decoder.match(lowerPath, data, ctx)) {
			try {
				return decoder.convert(data, lowerPath, ctx);
			} catch {
				return data;
			}
		}
	}

	return data;
}
