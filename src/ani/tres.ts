import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { cwd } from "node:process";
import { readNpkFile } from "../npk/index";
import { AniFile } from "./AniFile";

export interface TresOptions {
	aniDir: string;
	outputDir: string;
}

function generateUid(): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let uid = "";
	for (let i = 0; i < 13; i++) {
		uid += chars[Math.floor(Math.random() * chars.length)];
	}
	return `uid://${uid}`;
}

function generateExtId(counter: number): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let suffix = "";
	for (let i = 0; i < 5; i++) {
		suffix += chars[Math.floor(Math.random() * chars.length)];
	}
	return `${counter}_${suffix}`;
}

function findAniFiles(dir: string): string[] {
	const results: string[] = [];
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findAniFiles(fullPath));
		} else if (entry.name.toLowerCase().endsWith(".ani")) {
			results.push(fullPath);
		}
	}
	return results;
}

/**
 * 从 imagePath 推断 IMG 名称
 * "character/swordman/equipment/avatar/skin/sm_body%04d.img" -> "sm_body0000.img"
 */
function inferImgName(imagePath: string): string {
	const lastPart = imagePath.split("/").pop() ?? "";
	return lastPart.replace("%04d", "0000");
}

/**
 * 扫描 aniDir 下的所有 .ani 文件，按 IMG 分组
 */
export function groupAnisByImg(
	aniDir: string,
): Map<string, { aniFile: AniFile; aniPath: string }[]> {
	const aniFiles = findAniFiles(aniDir);
	const imgGroups = new Map<string, { aniFile: AniFile; aniPath: string }[]>();

	for (const aniPath of aniFiles) {
		const aniFile = AniFile.fromPath(aniPath);

		if (aniFile.frames.length === 0) continue;
		const firstFrame = aniFile.frames[0];
		if (!firstFrame) continue;
		const firstImagePath = firstFrame.imagePath;
		const imgName = inferImgName(firstImagePath);

		if (!imgName) continue;
		if (!imgGroups.has(imgName)) {
			imgGroups.set(imgName, []);
		}
		imgGroups.get(imgName)?.push({ aniFile, aniPath });
	}

	return imgGroups;
}

function mapAniPathToSpritePath(
	aniPath: string,
	frameIndex: number,
	spriteBaseDir: string,
): string {
	// 占位符 %04d 保持原样，写成 0000
	const pathWithIndex = aniPath.replace("%04d", "0000");
	const lowerPath = pathWithIndex.toLowerCase();
	return join(
		spriteBaseDir,
		lowerPath.replace(/\.img$/, ".img"),
		`${frameIndex}.png`,
	);
}

function escapeTresString(str: string): string {
	return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 扫描 NPK 文件夹，只收集 aniNeededImgs 中需要的 IMG 的 links
 */
export function buildLinkMap(
	npkDir: string,
	aniNeededImgs: Set<string>,
): Map<string, Record<string, number>> {
	const linkMap = new Map<string, Record<string, number>>();
	const entries = readdirSync(npkDir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.name.toLowerCase().endsWith(".npk")) continue;
		const npkPath = join(npkDir, entry.name);
		const albums = readNpkFile(npkPath);
		for (const album of albums) {
			if (album.isAudio()) continue;
			const imgName = basename(album.path);
			if (!aniNeededImgs.has(imgName)) continue;
			const links = album.getLinks();
			linkMap.set(imgName, links ?? {});
		}
	}
	return linkMap;
}

/**
 * 解析帧索引，如果是 LINK 帧则替换为目标帧
 */
function resolveFrameIndex(
	imgPath: string,
	frameIndex: number,
	linkMap: Map<string, Record<string, number>>,
): number {
	const imgLinks = linkMap.get(imgPath);
	if (!imgLinks) return frameIndex;
	const target = imgLinks[frameIndex.toString()];
	return target !== undefined ? target : frameIndex;
}

/**
 * 生成单个 .tres 文件的内容
 */
export function generateTresContent(
	anis: { aniFile: AniFile; aniPath: string }[],
	linkMap: Map<string, Record<string, number>>,
	spriteBaseDir: string,
): string {
	const lines: string[] = [];
	const resourceUid = generateUid();
	lines.push(
		`[gd_resource type="SpriteFrames" format=3 uid="${resourceUid}"]`,
	);
	lines.push("");

	// ext_resource 映射
	const extIdMap = new Map<string, string>();
	let extCounter = 1;

	// 先收集所有帧的 spritePath，用于生成 ext_resource
	const spritePaths: string[] = [];
	for (const { aniFile } of anis) {
		for (const frame of aniFile.frames) {
			const imgName = inferImgName(frame.imagePath);
			const resolvedIndex = resolveFrameIndex(
				imgName,
				frame.imageIndex,
				linkMap,
			);
			const spritePath = mapAniPathToSpritePath(
				frame.imagePath,
				resolvedIndex,
				spriteBaseDir,
			);
			spritePaths.push(spritePath);
		}
	}

	// 生成 ext_resource 行（去重）
	for (const spritePath of spritePaths) {
		if (!extIdMap.has(spritePath)) {
			const extId = generateExtId(extCounter);
			extIdMap.set(spritePath, extId);
			lines.push(
				`[ext_resource type="Texture2D" uid="uid://${generateUid().replace("uid://", "")}" path="res://${escapeTresString(spritePath)}" id="${extId}"]`,
			);
			extCounter++;
		}
	}

	lines.push("");
	lines.push("[resource]");
	lines.push("animations = [");

	// 生成每个动画
	const animEntries: string[] = [];
	for (const { aniFile } of anis) {
		const framesStr = aniFile.frames
			.map((frame) => {
				const imgName = inferImgName(frame.imagePath);
				const resolvedIndex = resolveFrameIndex(
					imgName,
					frame.imageIndex,
					linkMap,
				);
				const spritePath = mapAniPathToSpritePath(
					frame.imagePath,
					resolvedIndex,
					spriteBaseDir,
				);
				const extId = extIdMap.get(spritePath) ?? "1_unknown";
				return `{\n"duration": ${frame.delay / 100},\n"texture": ExtResource("${extId}")\n}`;
			})
			.join(", ");

		animEntries.push(
			`{\n"frames": [${framesStr}],\n"loop": false,\n"name": &"${aniFile.name}",\n"speed": 5.0\n}`,
		);
	}

	lines.push(animEntries.join(",\n"));
	lines.push("]");
	lines.push("");

	return lines.join("\n");
}

export function generateTresFiles(options: TresOptions): void {
	const { aniDir, outputDir } = options;

	const imgGroups = groupAnisByImg(aniDir);

	if (imgGroups.size === 0) {
		console.log("No .ani files found");
		return;
	}

	// 扫描 aniDir 下的 NPK 文件构建 LINK 映射
	const linkMap = buildLinkMap(aniDir, new Set(imgGroups.keys()));

	console.log(`Found ${imgGroups.size} IMG group(s) from .ani files\n`);

	for (const [imgName, anis] of imgGroups) {
		if (!linkMap.has(imgName)) {
			console.error(
				`[WARN] IMG "${imgName}" not found in any NPK under ${aniDir}, .tres may reference non-existent PNG files`,
			);
			continue;
		}

		const aniNames = anis.map((a) => basename(a.aniPath));
		console.log(`[${imgName}] ${aniNames.join(", ")}`);
		const spriteBaseDir = join(outputDir, "sprite");
		const tresPath = join(cwd(), "tres", imgName.replace(".img", ".tres"));

		const tresContent = generateTresContent(anis, linkMap, spriteBaseDir);

		mkdirSync(join(cwd(), "tres"), { recursive: true });
		writeFileSync(tresPath, tresContent, "utf-8");
		console.log(`  -> ${tresPath}`);
	}

	console.log("\nDone!");
}
