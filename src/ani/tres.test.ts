import { beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateTresFiles } from "./tres";

const TEST_ANI_DIR = "./test/aniTest";
const TEST_OUTPUT_DIR = "./test/aniTest";

beforeAll(() => {
	generateTresFiles({ aniDir: TEST_ANI_DIR, outputDir: TEST_OUTPUT_DIR });
});

test("生成 sm_body0000.tres 文件", () => {
	const tresPath = join(TEST_OUTPUT_DIR, "sm_body0000.tres");
	const content = readFileSync(tresPath, "utf-8");

	expect(content).toContain('[gd_resource type="SpriteFrames" format=3 uid="');
	expect(content).toContain("uid://");
	expect(content).toContain('id="1_');
	expect(content).toContain('id="2_');
	expect(content).toContain("[resource]");
	expect(content).toContain("animations = [");
});

test("header 包含 uid", () => {
	const tresPath = join(TEST_OUTPUT_DIR, "sm_body0000.tres");
	const content = readFileSync(tresPath, "utf-8");
	const headerMatch = content.match(
		/\[gd_resource type="SpriteFrames" format=3 uid="([^"]+)"\]/,
	);

	expect(headerMatch).not.toBeNull();
	expect(headerMatch?.[1]).toMatch(/^uid:\/\//);
});

test("ext_resource id 格式正确 (counter_suffix)", () => {
	const tresPath = join(TEST_OUTPUT_DIR, "sm_body0000.tres");
	const content = readFileSync(tresPath, "utf-8");
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
	const tresPath = join(TEST_OUTPUT_DIR, "sm_body0000.tres");
	const content = readFileSync(tresPath, "utf-8");

	expect(content).toContain('"frames": [');
	expect(content).toContain('"loop": true');
	expect(content).toContain('"name": &"');
	expect(content).toContain('"speed": 5.0');

	const animBlocks = content.match(/\{[\s\S]*?"frames":\s*\[/g);
	expect(animBlocks).not.toBeNull();
	expect(animBlocks?.length).toBe(3);
});

test("多个 .ani 共享同一 IMG 生成一个 .tres", () => {
	const tresPath = join(TEST_OUTPUT_DIR, "sm_body0000.tres");
	const content = readFileSync(tresPath, "utf-8");

	expect(content).toContain('"name": &"attack1"');
	expect(content).toContain('"name": &"attack2"');
	expect(content).toContain('"name": &"attack3"');
});

test("frames 数组中每个 frame 包含 duration 和 texture", () => {
	const tresPath = join(TEST_OUTPUT_DIR, "sm_body0000.tres");
	const content = readFileSync(tresPath, "utf-8");

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