import { readdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import {
	extractAudioFromAlbums,
	extractSpritesFromAlbums,
} from "./src/extract/index";
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
	totalAudio += extractAudioFromAlbums(albums);

	const imageAlbums = albums.filter((a) => !a.isAudio());

	if (linkMode) {
		for (const album of imageAlbums) {
			const links = album.getLinks();
			if (!links) continue;

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

	totalSprites += extractSpritesFromAlbums(
		imageAlbums,
		OUTPUT_BASE,
		npkFile,
		linkMode,
	);
}

console.log(
	`\nDone! Extracted ${totalAudio} audio files, ${totalSprites} sprites`,
);
