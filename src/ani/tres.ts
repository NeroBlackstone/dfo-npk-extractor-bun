import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { cwd } from "node:process";
import { readNpkFile } from "../npk/index";
import { type AniData, parseBinaryAni } from "../pvf/decoders/ani-binary";
import { readPvf } from "../pvf/reader";

export interface PvfAniEntry {
	name: string;
	aniPath: string;
	data: AniData;
}

export interface TresOptions {
	pvfPath: string;
	npkDir: string;
	prefix: string;
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

/**
 * 从 imagePath 推断 IMG 名称
 * "character/swordman/equipment/avatar/skin/sm_body%04d.img" -> "sm_body0000.img"
 */
function inferImgName(imagePath: string): string {
	const lastPart = imagePath.split("/").pop() ?? "";
	return lastPart.replace("%04d", "0000");
}

function mapAniPathToSpritePath(aniPath: string, frameIndex: number): string {
	const pathWithIndex = aniPath.replace("%04d", "0000");
	const lowerPath = pathWithIndex.toLowerCase();
	return join(lowerPath.replace(/\.img$/, ".img"), `${frameIndex}.png`);
}

function escapeTresString(str: string): string {
	return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 扫描 NPK 文件夹，收集 aniNeededImgs 中需要的 IMG 的 links
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
			const imgName = basename(album.path).toLowerCase();
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
 * 从 PVF 读取二进制 .ani 文件，按 IMG 分组
 */
export async function groupPvfAnisByImg(
	pvfPath: string,
): Promise<Map<string, PvfAniEntry[]>> {
	const { entries, getFileData } = await readPvf(pvfPath);
	const imgGroups = new Map<string, PvfAniEntry[]>();

	for (const entry of entries) {
		const lowerPath = entry.filePath.toLowerCase();
		if (!lowerPath.endsWith(".ani")) continue;

		const data = await getFileData(entry);
		if (data.length === 0) continue;

		try {
			const aniData = parseBinaryAni(data);
			const name = basename(entry.filePath).replace(/\.ani$/, "");

			if (aniData.frames.length === 0) continue;
			const firstFrame = aniData.frames[0];
			if (!firstFrame) continue;

			const imgName = inferImgName(firstFrame.path);
			if (!imgName) continue;

			let group = imgGroups.get(imgName);
			if (!group) {
				group = [];
				imgGroups.set(imgName, group);
			}
			group.push({ name, aniPath: entry.filePath, data: aniData });
		} catch {
			// Skip binary ANI files that fail to parse
		}
	}

	return imgGroups;
}

/**
 * 从 AniData 直接生成 .tres 文件内容
 */
export function generateTresFromPvf(
	anis: PvfAniEntry[],
	linkMap: Map<string, Record<string, number>>,
	prefix: string,
): string {
	const lines: string[] = [];
	const resourceUid = generateUid();
	lines.push(`[gd_resource type="SpriteFrames" format=3 uid="${resourceUid}"]`);
	lines.push("");

	// ext_resource 映射
	const extIdMap = new Map<string, string>();
	let extCounter = 1;

	// 收集所有帧的 spritePath
	const spritePaths: string[] = [];
	for (const { data } of anis) {
		for (const frame of data.frames) {
			const imgName = inferImgName(frame.path);
			const resolvedIndex = resolveFrameIndex(imgName, frame.imgParam, linkMap);
			const spritePath = mapAniPathToSpritePath(frame.path, resolvedIndex);
			spritePaths.push(spritePath);
		}
	}

	// 生成 ext_resource 行（去重）
	for (const spritePath of spritePaths) {
		if (!extIdMap.has(spritePath)) {
			const extId = generateExtId(extCounter);
			extIdMap.set(spritePath, extId);
			lines.push(
				`[ext_resource type="Texture2D" uid="uid://${generateUid().replace("uid://", "")}" path="res://${prefix ? `${prefix}/` : ""}${escapeTresString(spritePath)}" id="${extId}"]`,
			);
			extCounter++;
		}
	}

	lines.push("");
	lines.push("[resource]");
	lines.push("animations = [");

	// 生成每个动画
	const animEntries: string[] = [];
	for (const { data, name } of anis) {
		const framesStr = data.frames
			.map((frame) => {
				const imgName = inferImgName(frame.path);
				const resolvedIndex = resolveFrameIndex(
					imgName,
					frame.imgParam,
					linkMap,
				);
				const spritePath = mapAniPathToSpritePath(frame.path, resolvedIndex);
				const extId = extIdMap.get(spritePath) ?? "1_unknown";
				return `{\n"duration": ${frame.delay / 100},\n"texture": ExtResource("${extId}")\n}`;
			})
			.join(", ");

		animEntries.push(
			`{\n"frames": [${framesStr}],\n"loop": ${data.loop},\n"name": &"${name}",\n"speed": 5.0\n}`,
		);
	}

	lines.push(animEntries.join(",\n"));
	lines.push("]");
	lines.push("");

	return lines.join("\n");
}

export async function generateTresFiles(options: TresOptions): Promise<void> {
	const { pvfPath, npkDir, prefix } = options;

	const imgGroups = await groupPvfAnisByImg(pvfPath);

	if (imgGroups.size === 0) {
		console.log("No .ani files found in PVF");
		return;
	}

	// NPK link resolution
	const linkMap = buildLinkMap(npkDir, new Set(imgGroups.keys()));

	console.log(`Found ${imgGroups.size} IMG group(s) from PVF .ani files\n`);

	for (const [imgName, anis] of imgGroups) {
		if (!linkMap.has(imgName)) {
			console.error(
				`[WARN] IMG "${imgName}" not found in any NPK under ${npkDir}, .tres may reference non-existent PNG files`,
			);
			continue;
		}

		const aniNames = anis.map((a) => basename(a.aniPath));
		console.log(`[${imgName}] ${aniNames.join(", ")}`);
		const tresPath = join(cwd(), "tres", imgName.replace(".img", ".tres"));

		const tresContent = generateTresFromPvf(anis, linkMap, prefix);

		mkdirSync(join(cwd(), "tres"), { recursive: true });
		writeFileSync(tresPath, tresContent, "utf-8");
		console.log(`  -> ${tresPath}`);
	}

	console.log("\nDone!");
}
