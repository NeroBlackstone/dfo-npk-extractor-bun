import { execSync } from "node:child_process";
import { readdirSync, unlinkSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { ensureDir } from "../utils/file";
import { decryptAvi, isEncryptedAvi } from "./decrypt";

export interface ExtractOptions {
	inputPath: string;
	outputDir: string;
	ogv: boolean;
}

export function extract(options: ExtractOptions): void {
	const { inputPath, outputDir, ogv } = options;
	const entries = readdirSync(inputPath, { recursive: true });
	const aviFiles = entries
		.filter((f) => typeof f === "string" && extname(f).toLowerCase() === ".avi")
		.map((f) => join(inputPath, f as string));

	let count = 0;
	for (const file of aviFiles) {
		try {
			if (!isEncryptedAvi(file)) {
				console.log(`跳过非加密 avi: ${file}`);
				continue;
			}

			const relPath = relative(inputPath, file);
			const dstPath = join(outputDir, relPath);
			ensureDir(dirname(dstPath));
			decryptAvi(file, dstPath);
			console.log(`解密: ${file} -> ${dstPath}`);

			if (ogv) {
				const ogvPath = dstPath.replace(/\.avi$/, ".ogv");
				console.log(`转换: ${dstPath} -> ${ogvPath}`);
				execSync(
					`ffmpeg -y -i "${dstPath}" -q:v 6 -q:a 6 -g:v 64 "${ogvPath}"`,
					{ stdio: "pipe" },
				);
				unlinkSync(dstPath);
				console.log(`删除中间文件: ${dstPath}`);
			}

			count++;
		} catch (e) {
			console.error(`处理失败: ${file} - ${e}`);
		}
	}
	console.log(`完成: 解密 ${count} 个文件`);
}

export { decryptAvi, isEncryptedAvi, outputName } from "./decrypt";
