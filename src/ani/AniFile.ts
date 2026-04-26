import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface AniFrame {
	imagePath: string;
	imageIndex: number;
	delay: number;
}

export class AniFile {
	readonly name: string;
	readonly frames: AniFrame[];

	constructor(name: string, frames: AniFrame[]) {
		this.name = name;
		this.frames = frames;
	}

	static fromPath(filePath: string): AniFile {
		const content = readFileSync(filePath, "utf-8");
		const name = basename(filePath).replace(/\.ani$/, "");
		return parseAniContent(content, name);
	}

	toTres(spriteBaseDir: string, resourceUid?: string): string {
		const uid = resourceUid || generateUid();

		const lines: string[] = [];
		lines.push(`[gd_resource type="SpriteFrames" format=3 uid="${uid}"]`);
		lines.push("");

		const frameRefs: { textureId: string; duration: number }[] = [];
		for (const frame of this.frames) {
			const extId = `1_${frameRefs.length}`;
			const spritePath = mapAniPathToSpritePath(
				frame.imagePath,
				frame.imageIndex,
				spriteBaseDir,
			);
			lines.push(
				`[ext_resource type="Texture2D" uid="uid://${extId}" path="res://${escapeTresString(spritePath)}" id="${extId}"]`,
			);
			frameRefs.push({ textureId: extId, duration: frame.delay / 100 });
		}

		lines.push("");
		lines.push("[resource]");
		lines.push("animations = [{");

		const animFrames = frameRefs
			.map(
				(f) =>
					`{"duration": ${f.duration}, "texture": ExtResource("${f.textureId}")}`,
			)
			.join(",\n");
		lines.push(animFrames);
		lines.push(`],"loop": true,`);
		lines.push(`"name": &"${this.name}",`);
		lines.push(`"speed": 10`);
		lines.push("}]");

		return lines.join("\n");
	}

	writeTres(outputPath: string, spriteBaseDir: string): void {
		writeFileSync(outputPath, this.toTres(spriteBaseDir), "utf-8");
	}
}

function parseAniContent(content: string, name: string): AniFile {
	const lines = content.split(/\r?\n/);
	let lineIdx = 0;

	while (lineIdx < lines.length && !lines[lineIdx]?.startsWith("[FRAME MAX]")) {
		lineIdx++;
	}
	lineIdx++;

	const frameCount = parseInt(lines[lineIdx]?.trim() || "0", 10);
	lineIdx++;

	const frames: AniFrame[] = [];
	for (let i = 0; i < frameCount; i++) {
		while (lineIdx < lines.length && !lines[lineIdx]?.match(/^\[FRAME\d+\]$/)) {
			lineIdx++;
		}
		lineIdx++;

		const frame: AniFrame = { imagePath: "", imageIndex: 0, delay: 50 };

		while (
			lineIdx < lines.length &&
			!lines[lineIdx]?.trim().startsWith("[IMAGE]")
		) {
			lineIdx++;
		}
		lineIdx++;
		const imageLine = lines[lineIdx]?.trim() || "";
		lineIdx++;
		const indexLine = lines[lineIdx]?.trim() || "0";
		lineIdx++;
		const imageMatch = imageLine.match(/^`(.+)`$/);
		if (imageMatch) {
			frame.imagePath = imageMatch[1] ?? "";
			frame.imageIndex = parseInt(indexLine, 10);
		}

		while (
			lineIdx < lines.length &&
			!lines[lineIdx]?.trim().startsWith("[IMAGE POS]")
		) {
			lineIdx++;
		}
		lineIdx++;
		lineIdx++;

		while (
			lineIdx < lines.length &&
			!lines[lineIdx]?.trim().startsWith("[DELAY]")
		) {
			lineIdx++;
		}
		lineIdx++;
		const delayLine = lines[lineIdx]?.trim() || "50";
		frame.delay = parseInt(delayLine, 10);
		lineIdx++;

		while (lineIdx < lines.length) {
			const line = lines[lineIdx]?.trim() || "";
			if (line.startsWith("[FRAME")) break;
			if (line.startsWith("[DAMAGE BOX]") || !line) {
				lineIdx++;
				continue;
			}
			break;
		}

		frames.push(frame);
	}

	return new AniFile(name, frames);
}

function generateUid(): string {
	return `uid://${Math.random().toString(36).substring(2, 18)}`;
}

function escapeTresString(str: string): string {
	return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function mapAniPathToSpritePath(
	aniPath: string,
	frameIndex: number,
	spriteBaseDir: string,
): string {
	const pathWithIndex = aniPath.replace(
		"%04d",
		String(frameIndex).padStart(4, "0"),
	);
	const lowerPath = pathWithIndex.toLowerCase();
	const spritePath = join(
		spriteBaseDir,
		lowerPath.replace(/\.img$/, ".img"),
		`${frameIndex}.png`,
	);
	return spritePath;
}
