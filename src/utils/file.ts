import { existsSync, mkdirSync } from "node:fs";

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string) {
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath, { recursive: true });
	}
}
