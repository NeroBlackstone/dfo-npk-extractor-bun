import { readdirSync } from "node:fs";
import {
	extractAudioFromNpk,
	extractSpritesFromNpk,
} from "./src/extract/index";

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

let totalAudio = 0;
let totalSprites = 0;
for (const npkFile of npkFiles) {
	totalAudio += extractAudioFromNpk(npkFile);
	totalSprites += extractSpritesFromNpk(npkFile, OUTPUT_BASE);
}

console.log(
	`\nDone! Extracted ${totalAudio} audio files, ${totalSprites} sprites`,
);
