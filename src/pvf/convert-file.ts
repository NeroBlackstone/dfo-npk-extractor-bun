import { parseBinaryAni } from "./ani-binary";
import { serializeAniToText } from "./ani-text";
import { parseDocument } from "./document";
import { serializeDocumentToText } from "./document-text";
import { decompileScriptFile, isScriptFile } from "./script-file";
import { decodeBig5, decodeEucKr } from "./string-table";
import type { PvfStringContext } from "./types";

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

	if (lowerPath.endsWith(".ani")) {
		try {
			const aniData = parseBinaryAni(data);
			return serializeAniToText(aniData);
		} catch {
			return data;
		}
	}

	if (lowerPath.endsWith(".str")) {
		return decodeBig5(data);
	}

	if (lowerPath.endsWith(".nut")) {
		return decodeEucKr(data);
	}

	if (
		lowerPath !== "stringtable.bin" &&
		lowerPath !== "n_string.lst" &&
		data.length > 7
	) {
		if (isScriptFile(data)) {
			try {
				return decompileScriptFile(data, ctx);
			} catch {
				return data;
			}
		}

		try {
			const docTree = parseDocument(data, ctx);
			return serializeDocumentToText(docTree);
		} catch {
			return data;
		}
	}

	return data;
}
