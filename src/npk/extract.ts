import { readdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { ensureDir } from "../utils/file";
import { readNpkFile } from "./index";

export interface ExtractOptions {
	npkPath?: string | null;
	linkMode: boolean;
	workDir: string;
	outputBase: string;
}

export function extract(options: ExtractOptions): void {
	const { npkPath, linkMode, workDir, outputBase } = options;

	const npkFiles = npkPath
		? [npkPath]
		: readdirSync(workDir).filter((f) => f.toLowerCase().endsWith(".npk"));

	if (npkFiles.length === 0) {
		console.log(
			npkPath
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
				if (album.extractAudio(outputBase)) {
					totalAudio++;
					audioPaths.push(album.path);
				}
			} else {
				if (linkMode) {
					const links = album.getLinks();
					if (links) {
						const jsonPath = `${outputBase}/${album.path}/${basename(album.path)}.links.json`;
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

				npkSprites += album.extractSprites(outputBase, linkMode);
			}
		}

		if (linkMode) {
			const firstOgg = audioPaths[0];
			if (firstOgg) {
				const firstOggDir = firstOgg.substring(0, firstOgg.lastIndexOf("/"));
				const npkBaseName = npkFile.replace(/.*\//, "").replace(".npk", "");
				const metaPath = `${outputBase}/${firstOggDir}/${npkBaseName}.npk.json`;
				ensureDir(metaPath.substring(0, metaPath.lastIndexOf("/")));
				writeFileSync(
					metaPath,
					JSON.stringify({ npkFile, sounds: audioPaths }, null, 2),
				);
			}
		}

		console.log(
			`[${npkFile}] ${audioPaths.length} audio, ${npkSprites} sprites`,
		);
		totalSprites += npkSprites;
	}

	console.log(
		`\nDone! Extracted ${totalAudio} audio files, ${totalSprites} sprites`,
	);
}
