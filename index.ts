import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createPng } from "./src/img/png";
import { readNpkFile } from "./src/npk/index";

/**
 * 将路径转换为目录结构
 * album path: sprite/monster/screamingcave/apopis/(tn)apopis.img
 * + sprite index 0
 * -> sprite/monster/screamingcave/apopis/(tn)apopis.img/0.png
 */
function pathToDirStructure(
	albumPath: string,
	spriteIndex: number,
	baseDir: string,
): string {
	// albumPath 已经是 / 分隔的路径
	// 直接以 albumPath 作为目录，spriteIndex 作为文件名
	return `${baseDir}/${albumPath}/${spriteIndex}.png`;
}

function extractSpritesFromNpk(npkPath: string, outputBase: string) {
	const albums = readNpkFile(npkPath);
	console.log(`[${npkPath}] Found ${albums.length} albums`);

	let savedCount = 0;

	for (const album of albums) {
		const sprites = album.getSprites();

		for (let i = 0; i < sprites.length; i++) {
			const sprite = sprites[i];
			if (!sprite) continue;

			// Skip LINK type
			if (sprite.type === 0x11) {
				continue;
			}

			const decodedData = album.decodeSpriteData(i);
			if (!decodedData) {
				continue;
			}

			const width = sprite.width;
			const height = sprite.height;
			if (!width || !height) {
				continue;
			}

			// 转换路径
			const relativePath = pathToDirStructure(album.path, i, outputBase);

			// 确保目录存在
			const dirPath = relativePath.substring(0, relativePath.lastIndexOf("/"));
			if (!existsSync(dirPath)) {
				mkdirSync(dirPath, { recursive: true });
			}

			try {
				const png = createPng(decodedData, width, height);
				writeFileSync(relativePath, png);
				savedCount++;
			} catch (e) {
				console.log(`  Sprite ${i}: PNG save error: ${e}`);
			}
		}
	}

	return savedCount;
}

// 扫描工作目录下的所有 .npk 文件
const WORK_DIR = ".";
const OUTPUT_BASE = ".";

const files = readdirSync(WORK_DIR);
const npkFiles = files.filter((f) => f.toLowerCase().endsWith(".npk"));

if (npkFiles.length === 0) {
	console.log("No .npk files found in working directory");
	process.exit(0);
}

console.log(`Found ${npkFiles.length} NPK file(s)\n`);

let totalSaved = 0;
for (const npkFile of npkFiles) {
	totalSaved += extractSpritesFromNpk(npkFile, OUTPUT_BASE);
}

console.log(`\nDone! Saved ${totalSaved} sprites`);
