import { describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { AniFile } from "./index";

const ANI_PATH = "test/test.ani";

describe("AniFile", () => {
	test("fromPath parses test.ani", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		expect(ani.name).toBe("test");
		expect(ani.frames.length).toBe(5);
	});

	test("first frame has correct imagePath and imageIndex", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		const frame = ani.frames[0]!;
		expect(frame.imagePath).toBe(
			"MyGame/Hero/Knight/armor/knight_body%04d.img",
		);
		expect(frame.imageIndex).toBe(0);
		expect(frame.delay).toBe(80);
	});

	test("last frame has correct imageIndex and delay", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		const frame = ani.frames.at(-1)!;
		expect(frame.imagePath).toBe(
			"MyGame/Hero/Knight/armor/knight_body%04d.img",
		);
		expect(frame.imageIndex).toBe(4);
		expect(frame.delay).toBe(200);
	});

	test("all frames have valid imagePath", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		for (const frame of ani.frames) {
			expect(frame.imagePath).not.toBe("");
			expect(frame.imagePath).toContain("%04d");
		}
	});

	test("all frames have imageIndex in ascending order", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		for (let i = 0; i < ani.frames.length; i++) {
			expect(ani.frames[i]?.imageIndex).toBe(i);
		}
	});
});

describe("AniFile.toTres", () => {
	test("generates valid tres content", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		const tres = ani.toTres("sprite");

		expect(tres).toContain(
			'[gd_resource type="SpriteFrames" format=3 uid="uid://',
		);
		expect(tres).toContain('[ext_resource type="Texture2D"');
		expect(tres).toContain('"name": &"test"');
		expect(tres).toContain('"speed": 10');
	});

	test("duration is delay / 100", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		const tres = ani.toTres("sprite");

		expect(tres).toContain('"duration": 0.8');
		expect(tres).toContain('"duration": 2');
	});

	test("generates correct frame count", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		const tres = ani.toTres("sprite");

		expect(tres).toContain('ExtResource("1_0")');
		expect(tres).toContain('ExtResource("1_4")');
	});

	test("sprite path uses imageIndex not array position", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		const tres = ani.toTres("sprite");

		expect(tres).toContain(
			"res://sprite/mygame/hero/knight/armor/knight_body0000.img/0.png",
		);
	});
});

describe("AniFile.writeTres", () => {
	test("writes tres file", () => {
		const ani = AniFile.fromPath(ANI_PATH);
		const outputPath = "test/test_output.tres";
		ani.writeTres(outputPath, "sprite");

		expect(existsSync(outputPath)).toBe(true);
		unlinkSync(outputPath);
	});
});
