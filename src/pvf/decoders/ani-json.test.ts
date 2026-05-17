import { describe, expect, test } from "bun:test";
import { parseBinaryAni } from "./ani-binary";
import { aniDataToJson, serializeAniToJson } from "./ani-json";

describe("serializeAniToJson", () => {
	test("should convert binary ANI to JSON with all fields", () => {
		// Construct minimal binary ANI:
		// framesCount=1, countOfResources=1
		// resource: "test.img" (9 bytes)
		// animParamCount=0
		// frame: 0 boxes, imgId=0, imgParam=0, x=100, y=200, 0 properties
		const buf = Buffer.alloc(4 + 4 + 9 + 2 + 2 + 4 + 2 + 2 + 4 + 4 + 2);
		let offset = 0;

		// framesCount (uint16 LE)
		buf.writeUInt16LE(1, offset);
		offset += 2;

		// countOfResources (uint16 LE)
		buf.writeUInt16LE(1, offset);
		offset += 2;

		// resourceLen (int32 LE)
		buf.writeInt32LE(9, offset);
		offset += 4;

		// resourceStr "test.img"
		buf.write("test.img", offset, 9, "ascii");
		offset += 9;

		// animParamCount (uint16 LE)
		buf.writeUInt16LE(0, offset);
		offset += 2;

		// boxCount (uint16 LE)
		buf.writeUInt16LE(0, offset);
		offset += 2;

		// imgId (int16 LE) = 0
		buf.writeInt16LE(0, offset);
		offset += 2;

		// imgParam (uint16 LE) = 0
		buf.writeUInt16LE(0, offset);
		offset += 2;

		// x (int32 LE) = 100
		buf.writeInt32LE(100, offset);
		offset += 4;

		// y (int32 LE) = 200
		buf.writeInt32LE(200, offset);
		offset += 4;

		// propertyCount (uint16 LE)
		buf.writeUInt16LE(0, offset);

		const aniData = parseBinaryAni(buf);
		const json = serializeAniToJson(aniData);
		const parsed = JSON.parse(json);

		expect(parsed.framesCount).toBe(1);
		expect(parsed.resources).toEqual(["test.img"]);
		expect(parsed.frames).toHaveLength(1);
		expect(parsed.frames[0]?.path).toBe("test.img");
		expect(parsed.frames[0]?.x).toBe(100);
		expect(parsed.frames[0]?.y).toBe(200);
	});

	test("should handle multiple frames with boxes", () => {
		// framesCount=1, countOfResources=1
		// resource: "char.img"
		// frame with 1 damage box and 1 attack box
		// Frame properties: DELAY=100, RGBA=0xFF8040FF
		// Calculate size:
		// header: 2+2+4+8+2 = 18
		// boxCount: 2
		// damage box: 2 + 24 = 26
		// attack box: 2 + 24 = 26
		// imgId+imgParam+x+y: 2+2+4+4 = 12
		// propertyCount: 2
		// DELAY: 2+4 = 6
		// RGBA: 2+4 = 6
		// Total: 18+2+26+26+12+2+6+6 = 98
		const buf = Buffer.alloc(100);
		let offset = 0;

		buf.writeUInt16LE(1, offset); // framesCount
		offset += 2;
		buf.writeUInt16LE(1, offset); // countOfResources
		offset += 2;
		buf.writeInt32LE(8, offset); // resourceLen
		offset += 4;
		buf.write("char.img", offset, 8, "ascii");
		offset += 8;
		buf.writeUInt16LE(0, offset); // animParamCount
		offset += 2;

		// boxCount
		buf.writeUInt16LE(2, offset);
		offset += 2;

		// damage box type=14
		buf.writeUInt16LE(14, offset);
		offset += 2;
		// damage box values [0, 0, 50, 50, 25, 25]
		const damageValues = [0, 0, 50, 50, 25, 25];
		for (const v of damageValues) {
			buf.writeInt32LE(v, offset);
			offset += 4;
		}

		// attack box type=15
		buf.writeUInt16LE(15, offset);
		offset += 2;
		// attack box values [10, 10, 40, 40, 25, 25]
		const attackValues = [10, 10, 40, 40, 25, 25];
		for (const v of attackValues) {
			buf.writeInt32LE(v, offset);
			offset += 4;
		}

		// imgId
		buf.writeInt16LE(0, offset);
		offset += 2;
		// imgParam
		buf.writeUInt16LE(5, offset);
		offset += 2;
		// x
		buf.writeInt32LE(50, offset);
		offset += 4;
		// y
		buf.writeInt32LE(100, offset);
		offset += 4;
		// propertyCount = 2 (DELAY + RGBA)
		buf.writeUInt16LE(2, offset);
		offset += 2;

		// DELAY type=12, data=100
		buf.writeUInt16LE(12, offset);
		offset += 2;
		buf.writeInt32LE(100, offset);
		offset += 4;

		// RGBA type=9, R=255, G=128, B=64, A=255
		buf.writeUInt16LE(9, offset);
		offset += 2;
		// The parser reads as: byte0 | (byte1 << 8) | (byte2 << 16) | (byte3 << 24)
		// So to get 0xFF8040FF (R=255, G=128, B=64, A=255):
		// byte0=A=255, byte1=B=64, byte2=G=128, byte3=R=255
		buf.writeUInt8(255, offset); // A
		buf.writeUInt8(64, offset + 1); // B
		buf.writeUInt8(128, offset + 2); // G
		buf.writeUInt8(255, offset + 3); // R

		const aniData = parseBinaryAni(buf);
		const json = serializeAniToJson(aniData);
		const parsed = JSON.parse(json);

		expect(parsed.frames).toHaveLength(1);
		const frame = parsed.frames[0]!;
		expect(frame.damageBox).toHaveLength(1);
		expect(frame.damageBox[0]).toEqual([0, 0, 50, 50, 25, 25]);
		expect(frame.attackBox).toHaveLength(1);
		expect(frame.attackBox[0]).toEqual([10, 10, 40, 40, 25, 25]);
		expect(frame.delay).toBe(100);
		expect(frame.color).toBe("0xFF8040FF");
	});

	test("should handle GRAPHIC_EFFECT with MONOCHROME", () => {
		// Single frame with GRAPHIC_EFFECT type=MONOCHROME (5) + RGB
		// header: 2+2+4+8+2 = 18
		// boxCount+x+y+imgId+imgParam: 2+4+4+2+2 = 14
		// propertyCount: 2
		// GRAPHIC_EFFECT: 2+2+3 = 7
		// Total: 18+14+2+7 = 41
		const buf = Buffer.alloc(42);
		let offset = 0;

		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeInt32LE(8, offset);
		offset += 4;
		buf.write("test.img", offset, 8, "ascii");
		offset += 8;
		buf.writeUInt16LE(0, offset);
		offset += 2;
		buf.writeUInt16LE(0, offset); // boxCount
		offset += 2;
		buf.writeInt16LE(0, offset); // imgId
		offset += 2;
		buf.writeUInt16LE(0, offset); // imgParam
		offset += 2;
		buf.writeInt32LE(0, offset); // x
		offset += 4;
		buf.writeInt32LE(0, offset); // y
		offset += 4;
		buf.writeUInt16LE(1, offset); // propertyCount
		offset += 2;

		// GRAPHIC_EFFECT type=11
		buf.writeUInt16LE(11, offset);
		offset += 2;
		// itemType = 5 (MONOCHROME)
		buf.writeUInt16LE(5, offset);
		offset += 2;
		// RGB: 100, 150, 200
		buf.writeUInt8(100, offset);
		buf.writeUInt8(150, offset + 1);
		buf.writeUInt8(200, offset + 2);

		const aniData = parseBinaryAni(buf);
		const json = serializeAniToJson(aniData);
		const parsed = JSON.parse(json);

		expect(parsed.frames[0]?.itemType).toBe(5);
		expect(parsed.frames[0]?.effectColor).toEqual({ r: 100, g: 150, b: 200 });
	});

	test("should handle GRAPHIC_EFFECT with SPACEDISTORT", () => {
		// header: 18, boxCount+img: 14, propertyCount: 2, GRAPHIC_EFFECT: 2+2+4 = 8
		// Total: 18+14+2+8 = 42
		const buf = Buffer.alloc(44);
		let offset = 0;

		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeInt32LE(8, offset);
		offset += 4;
		buf.write("test.img", offset, 8, "ascii");
		offset += 8;
		buf.writeUInt16LE(0, offset);
		offset += 2;
		buf.writeUInt16LE(0, offset);
		offset += 2;
		buf.writeInt16LE(0, offset);
		offset += 2;
		buf.writeUInt16LE(0, offset);
		offset += 2;
		buf.writeInt32LE(0, offset);
		offset += 4;
		buf.writeInt32LE(0, offset);
		offset += 4;
		buf.writeUInt16LE(1, offset);
		offset += 2;

		buf.writeUInt16LE(11, offset);
		offset += 2;
		buf.writeUInt16LE(6, offset); // SPACEDISTORT
		offset += 2;
		buf.writeInt16LE(10, offset); // x
		buf.writeInt16LE(-5, offset + 2); // y

		const aniData = parseBinaryAni(buf);
		const json = serializeAniToJson(aniData);
		const parsed = JSON.parse(json);

		expect(parsed.frames[0]?.itemType).toBe(6);
		expect(parsed.frames[0]?.effectPos).toEqual({ x: 10, y: -5 });
	});

	test("should handle imgId = -1 (no image)", () => {
		// header: 18, boxCount: 2, imgId: 2, x: 4, y: 4, propertyCount: 2 = 32
		const buf = Buffer.alloc(34);
		let offset = 0;

		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeInt32LE(8, offset);
		offset += 4;
		buf.write("test.img", offset, 8, "ascii");
		offset += 8;
		buf.writeUInt16LE(0, offset);
		offset += 2;
		buf.writeUInt16LE(0, offset);
		offset += 2;
		buf.writeInt16LE(-1, offset); // imgId = -1 (no image)
		offset += 2;
		// No imgParam since imgId < 0
		buf.writeInt32LE(0, offset); // x
		offset += 4;
		buf.writeInt32LE(0, offset); // y
		offset += 4;
		buf.writeUInt16LE(0, offset); // propertyCount

		const aniData = parseBinaryAni(buf);
		const json = serializeAniToJson(aniData);
		const parsed = JSON.parse(json);

		expect(parsed.frames[0]?.imgId).toBe(-1);
		expect(parsed.frames[0]?.path).toBeUndefined();
	});

	test("should handle animation-level LOOP and SHADOW", () => {
		// header: 18, animParamCount: 2, LOOP: 3, SHADOW: 3, frame: 14, propertyCount: 2
		// Total: 18+2+3+3+14+2 = 42
		const buf = Buffer.alloc(44);
		let offset = 0;

		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeInt32LE(8, offset);
		offset += 4;
		buf.write("test.img", offset, 8, "ascii");
		offset += 8;
		buf.writeUInt16LE(2, offset); // animParamCount = 2
		offset += 2;

		// LOOP type=0, value=1 (true)
		buf.writeUInt16LE(0, offset);
		offset += 2;
		buf.writeInt8(1, offset);
		offset += 1;

		// SHADOW type=1, value=1 (true)
		buf.writeUInt16LE(1, offset);
		offset += 2;
		buf.writeInt8(1, offset);
		offset += 1;

		buf.writeUInt16LE(0, offset); // boxCount
		offset += 2;
		buf.writeInt16LE(0, offset); // imgId
		offset += 2;
		buf.writeUInt16LE(0, offset); // imgParam
		offset += 2;
		buf.writeInt32LE(0, offset); // x
		offset += 4;
		buf.writeInt32LE(0, offset); // y
		offset += 4;
		buf.writeUInt16LE(0, offset); // propertyCount

		const aniData = parseBinaryAni(buf);
		const json = serializeAniToJson(aniData);
		const parsed = JSON.parse(json);

		expect(parsed.loop).toBe(true);
		expect(parsed.shadow).toBe(true);
	});

	test("should output correct JSON structure", () => {
		// Two frames
		// header: 2+2+4+8+2 = 18
		// Frame 0: boxCount(2)+imgId(2)+imgParam(2)+x(4)+y(4)+propertyCount(2) = 16
		// Frame 1: same = 16
		// Total: 18+16+16 = 50
		const buf = Buffer.alloc(52);
		let offset = 0;

		buf.writeUInt16LE(2, offset); // framesCount = 2
		offset += 2;
		buf.writeUInt16LE(1, offset); // countOfResources = 1
		offset += 2;
		buf.writeInt32LE(6, offset); // resourceLen = "a.img" = 6
		offset += 4;
		buf.write("a.img", offset, 6, "ascii");
		offset += 6;
		buf.writeUInt16LE(0, offset); // animParamCount
		offset += 2;

		// Frame 0
		buf.writeUInt16LE(0, offset); // boxCount
		offset += 2;
		buf.writeInt16LE(0, offset); // imgId
		offset += 2;
		buf.writeUInt16LE(1, offset); // imgParam
		offset += 2;
		buf.writeInt32LE(0, offset); // x
		offset += 4;
		buf.writeInt32LE(0, offset); // y
		offset += 4;
		buf.writeUInt16LE(0, offset); // propertyCount
		offset += 2;

		// Frame 1
		buf.writeUInt16LE(0, offset); // boxCount
		offset += 2;
		buf.writeInt16LE(0, offset); // imgId
		offset += 2;
		buf.writeUInt16LE(2, offset); // imgParam
		offset += 2;
		buf.writeInt32LE(10, offset); // x
		offset += 4;
		buf.writeInt32LE(20, offset); // y
		offset += 4;
		buf.writeUInt16LE(0, offset); // propertyCount

		const aniData = parseBinaryAni(buf);
		const result = aniDataToJson(aniData);

		expect(result).toEqual({
			framesCount: 2,
			resources: ["a.img"],
			frames: [
				{
					imgParam: 1,
					path: "a.img",
				},
				{
					imgParam: 2,
					path: "a.img",
					x: 10,
					y: 20,
				},
			],
		});
	});
});
