import { expect, test } from "bun:test";
import { join } from "node:path";
import {
	generateTresContent,
	groupAnisByImg,
	buildLinkMap,
} from "./tres";

const TEST_ANI_DIR = "./test";

test("生成 .tres 内容格式正确", () => {
	const imgGroups = groupAnisByImg(TEST_ANI_DIR);
	const linkMap = buildLinkMap(TEST_ANI_DIR, new Set(imgGroups.keys()));

	const imgName = "img.img";
	const anis = imgGroups.get(imgName);
	expect(anis).toBeDefined();
	if (!anis) return;

	const spriteBaseDir = join(TEST_ANI_DIR, "sprite");
	const content = generateTresContent(anis, linkMap, spriteBaseDir);

	expect(content).toContain('[gd_resource type="SpriteFrames" format=3 uid="');
	expect(content).toContain("uid://");
	expect(content).toContain('id="1_');
	expect(content).toContain("[resource]");
	expect(content).toContain("animations = [");
});

test("header 包含 uid", () => {
	const imgGroups = groupAnisByImg(TEST_ANI_DIR);
	const linkMap = buildLinkMap(TEST_ANI_DIR, new Set(imgGroups.keys()));

	const imgName = "img.img";
	const anis = imgGroups.get(imgName);
	if (!anis) return;

	const spriteBaseDir = join(TEST_ANI_DIR, "sprite");
	const content = generateTresContent(anis, linkMap, spriteBaseDir);

	const headerMatch = content.match(
		/\[gd_resource type="SpriteFrames" format=3 uid="([^"]+)"\]/,
	);

	expect(headerMatch).not.toBeNull();
	expect(headerMatch?.[1]).toMatch(/^uid:\/\//);
});

test("ext_resource id 格式正确 (counter_suffix)", () => {
	const imgGroups = groupAnisByImg(TEST_ANI_DIR);
	const linkMap = buildLinkMap(TEST_ANI_DIR, new Set(imgGroups.keys()));

	const imgName = "img.img";
	const anis = imgGroups.get(imgName);
	if (!anis) return;

	const spriteBaseDir = join(TEST_ANI_DIR, "sprite");
	const content = generateTresContent(anis, linkMap, spriteBaseDir);

	const idMatches = content.matchAll(/id="(\d+)_([a-z0-9]+)"/g);

	const ids = Array.from(idMatches);
	expect(ids.length).toBeGreaterThan(0);

	for (const id of ids) {
		const [, counter, suffix] = id;
		expect(parseInt(counter, 10)).toBeGreaterThan(0);
		expect(suffix.length).toBe(5);
	}
});

test("animations 结构正确 - 每个动画是独立对象", () => {
	const imgGroups = groupAnisByImg(TEST_ANI_DIR);
	const linkMap = buildLinkMap(TEST_ANI_DIR, new Set(imgGroups.keys()));

	const imgName = "img.img";
	const anis = imgGroups.get(imgName);
	if (!anis) return;

	const spriteBaseDir = join(TEST_ANI_DIR, "sprite");
	const content = generateTresContent(anis, linkMap, spriteBaseDir);

	expect(content).toContain('"frames": [');
	expect(content).toContain('"loop": false');
	expect(content).toContain('"name": &"');
	expect(content).toContain('"speed": 5.0');

	const animBlocks = content.match(/\{[\s\S]*?"frames":\s*\[/g);
	expect(animBlocks).not.toBeNull();
	expect(animBlocks?.length).toBe(1);
});

test("单个 .ani 生成包含正确动画名", () => {
	const imgGroups = groupAnisByImg(TEST_ANI_DIR);
	const linkMap = buildLinkMap(TEST_ANI_DIR, new Set(imgGroups.keys()));

	const imgName = "img.img";
	const anis = imgGroups.get(imgName);
	if (!anis) return;

	const spriteBaseDir = join(TEST_ANI_DIR, "sprite");
	const content = generateTresContent(anis, linkMap, spriteBaseDir);

	expect(content).toContain('"name": &"test"');
});

test("frames 数组中每个 frame 包含 duration 和 texture", () => {
	const imgGroups = groupAnisByImg(TEST_ANI_DIR);
	const linkMap = buildLinkMap(TEST_ANI_DIR, new Set(imgGroups.keys()));

	const imgName = "img.img";
	const anis = imgGroups.get(imgName);
	if (!anis) return;

	const spriteBaseDir = join(TEST_ANI_DIR, "sprite");
	const content = generateTresContent(anis, linkMap, spriteBaseDir);

	const frameMatches = content.matchAll(
		/"duration":\s*([\d.]+)[^}]*"texture":\s*ExtResource\("([^"]+)"\)/g,
	);

	const frames = Array.from(frameMatches);
	expect(frames.length).toBeGreaterThan(0);

	for (const frame of frames) {
		const [, duration, extId] = frame;
		expect(parseFloat(duration)).toBeGreaterThan(0);
		expect(extId).toMatch(/^\d+_[a-z0-9]+$/);
	}
});