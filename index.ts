import { readdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { readNpkFile } from "./src/npk/index";
import { ensureDir } from "./src/utils/file";

// 扫描工作目录下的所有 .npk 文件
const WORK_DIR = ".";
const OUTPUT_BASE = ".";

// 解析 CLI 参数
const { positionals, values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		link: {
			type: "boolean",
			default: false,
		},
	},
	allowPositionals: true,
	strict: true,
});

const linkMode = values.link;

// 支持直接传 NPK 文件路径（最后一个参数），或扫描当前目录
const npkFileArg = positionals.length > 0 ? positionals.at(-1) : null;
const npkFiles = npkFileArg
	? [npkFileArg]
	: readdirSync(WORK_DIR).filter((f) => f.toLowerCase().endsWith(".npk"));

if (npkFiles.length === 0) {
	console.log(
		positionals.length > 0
			? "No .npk files found in specified paths"
			: "No .npk files found in working directory",
	);
	process.exit(0);
}

console.log(`Found ${npkFiles.length} NPK file(s)\n`);

let totalAudio = 0;
let totalSprites = 0;

for (const npkFile of npkFiles) {
	const albums = readNpkFile(npkFile);
	const audioPaths: string[] = [];
	let npkSprites = 0;

	for (const album of albums) {
		if (album.isAudio()) {
			if (album.extractAudio(OUTPUT_BASE)) {
				totalAudio++;
				audioPaths.push(album.path);
			}
		} else {
			if (linkMode) {
				const links = album.getLinks();
				if (links) {
					const jsonPath = `${OUTPUT_BASE}/${album.path}/${basename(album.path)}.links.json`;
					ensureDir(jsonPath.substring(0, jsonPath.lastIndexOf("/")));
					writeFileSync(
						jsonPath,
						JSON.stringify(
							{
								source: { npk: npkFile, img: album.path },
								links,
							},
							null,
							2,
						),
					);
				}
			}

			npkSprites += album.extractSprites(OUTPUT_BASE, linkMode);
		}
	}

	// 写入元数据文件到 OGG 同目录（仅 --link 模式）
	if (linkMode) {
		const firstOgg = audioPaths[0];
		if (firstOgg) {
			const firstOggDir = firstOgg.substring(0, firstOgg.lastIndexOf("/"));
			const npkBaseName = npkFile.replace(/.*\//, "").replace(".npk", "");
			const metaPath = `${OUTPUT_BASE}/${firstOggDir}/${npkBaseName}.npk.json`;
			ensureDir(metaPath.substring(0, metaPath.lastIndexOf("/")));
			writeFileSync(metaPath, JSON.stringify({ npkFile, sounds: audioPaths }, null, 2));
		}
	}

	console.log(`[${npkFile}] ${audioPaths.length} audio, ${npkSprites} sprites`);
	totalSprites += npkSprites;
}

console.log(
	`\nDone! Extracted ${totalAudio} audio files, ${totalSprites} sprites`,
);
