import { readdirSync, writeFileSync } from "node:fs";
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
const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		link: {
			type: "boolean",
			default: false,
		},
	},
	strict: true,
});

const linkMode = values.link;

const files = readdirSync(WORK_DIR);
const npkFiles = files.filter((f) => f.toLowerCase().endsWith(".npk"));

if (npkFiles.length === 0) {
	console.log("No .npk files found in working directory");
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

			const jsonPath = `${OUTPUT_BASE}/${album.path}.links.json`;
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
			console.log(`  Generated: ${jsonPath}`);
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
