import { describe, expect, test } from "bun:test";
import { generateTresFromPvf, groupPvfAnisByImg } from "./tres";

const TEST_PVF = "./test/fake.pvf";

describe("groupPvfAnisByImg", () => {
	test("从 PVF 中提取 .ani 并按 IMG 分组", async () => {
		const groups = await groupPvfAnisByImg(TEST_PVF);
		expect(groups.size).toBeGreaterThan(0);
	});

	test("fake.pvf 中的 move.ani 被正确解析", async () => {
		const groups = await groupPvfAnisByImg(TEST_PVF);
		// move.ani 引用 test/resource.img -> inferImgName 取文件名 -> resource.img
		const anis = groups.get("resource.img");
		expect(anis).toBeDefined();
		if (!anis) return;

		expect(anis.length).toBe(1);
		const first = anis[0];
		expect(first?.name).toBe("move");
		expect(first?.data.frames.length).toBe(2);
	});

	test("帧数据正确", async () => {
		const groups = await groupPvfAnisByImg(TEST_PVF);
		const anis = groups.get("resource.img");
		if (!anis?.[0]) return;

		const frame = anis[0].data.frames[0];
		expect(frame?.path).toBe("test/resource.img");
		expect(frame?.imgId).toBe(0);
	});
});

describe("generateTresFromPvf", () => {
	test("生成有效 .tres 内容", async () => {
		const groups = await groupPvfAnisByImg(TEST_PVF);
		const anis = groups.get("resource.img");
		if (!anis) return;

		const content = generateTresFromPvf(anis, new Map(), "");

		expect(content).toContain(
			'[gd_resource type="SpriteFrames" format=3 uid="',
		);
		expect(content).toContain("uid://");
		expect(content).toContain('id="1_');
		expect(content).toContain("[resource]");
		expect(content).toContain("animations = [");
	});

	test("ext_resource id 格式正确", async () => {
		const groups = await groupPvfAnisByImg(TEST_PVF);
		const anis = groups.get("resource.img");
		if (!anis) return;

		const content = generateTresFromPvf(anis, new Map(), "");

		const idMatches = content.matchAll(/id="(\d+)_([a-z0-9]+)"/g);
		const ids = Array.from(idMatches);
		expect(ids.length).toBeGreaterThan(0);

		for (const id of ids) {
			const counter = id[1];
			const suffix = id[2];
			expect(parseInt(counter ?? "0", 10)).toBeGreaterThan(0);
			expect(suffix?.length).toBe(5);
		}
	});

	test("frames 包含 duration 和 texture", async () => {
		const groups = await groupPvfAnisByImg(TEST_PVF);
		const anis = groups.get("resource.img");
		if (!anis) return;

		const content = generateTresFromPvf(anis, new Map(), "");

		const frameMatches = content.matchAll(
			/"duration":\s*([\d.]+)[^}]*"texture":\s*ExtResource\("([^"]+)"\)/g,
		);
		const frames = Array.from(frameMatches);
		expect(frames.length).toBe(2);
	});

	test("动画名从 data 推断", async () => {
		const groups = await groupPvfAnisByImg(TEST_PVF);
		const anis = groups.get("resource.img");
		if (!anis) return;

		const content = generateTresFromPvf(anis, new Map(), "");
		expect(content).toContain('"name": &"');
	});
});
