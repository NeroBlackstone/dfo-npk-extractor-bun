import type { AniData, AniFrame } from "./ani-binary";

/**
 * 将 AniData 序列化为 JSON 格式
 */
export function serializeAniToJson(data: AniData): string {
	return JSON.stringify(aniDataToJson(data), null, 2);
}

/**
 * 将 AniData 转换为 JSON-serializable 对象
 */
export function aniDataToJson(data: AniData): object {
	const result: Record<string, unknown> = {
		framesCount: data.framesCount,
		frames: data.frames.map(frameToJson),
	};
	if (data.loop) result.loop = true;
	if (data.shadow) result.shadow = true;
	if (data.resources.length > 0) result.resources = data.resources;
	return result;
}

function frameToJson(frame: AniFrame): object {
	const result: Record<string, unknown> = {};

	// Always include if non-default
	if (frame.imgId !== 0) result.imgId = frame.imgId;
	if (frame.imgParam !== 0) result.imgParam = frame.imgParam;
	if (frame.path !== "") result.path = frame.path;
	if (frame.x !== 0) result.x = frame.x;
	if (frame.y !== 0) result.y = frame.y;

	// Frame fields
	if (frame.coord !== 0) result.coord = frame.coord;
	if (frame.rateX !== 1) result.rateX = frame.rateX;
	if (frame.rateY !== 1) result.rateY = frame.rateY;
	if (frame.rotate !== 0) result.rotate = frame.rotate;
	if (frame.color !== 0xffffffff) result.color = toHexString(frame.color);
	if (frame.loop !== false) result.loop = frame.loop;
	if (frame.shadow !== false) result.shadow = frame.shadow;
	if (frame.interpolation !== false) result.interpolation = frame.interpolation;
	if (frame.delay !== 50) result.delay = frame.delay;
	if (frame.damageType !== 0) result.damageType = frame.damageType;
	if (frame.sound !== "") result.sound = frame.sound;
	if (frame.setFlag !== 0) result.setFlag = frame.setFlag;
	if (frame.flipType !== 0) result.flipType = frame.flipType;
	if (!arrayEquals(frame.clip, [0, 0, 0, 0])) result.clip = frame.clip;
	if (frame.loopStart !== false) result.loopStart = frame.loopStart;
	if (frame.loopEnd !== 0) result.loopEnd = frame.loopEnd;
	if (frame.itemType !== 0) result.itemType = frame.itemType;
	if (frame.effectColor) result.effectColor = frame.effectColor;
	if (frame.effectPos) result.effectPos = frame.effectPos;
	if (frame.damageBox.length > 0)
		result.damageBox = frame.damageBox.map((box) => box.values);
	if (frame.attackBox.length > 0)
		result.attackBox = frame.attackBox.map((box) => box.values);

	return result;
}

function arrayEquals(a: number[], b: number[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function toHexString(value: number): string {
	return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
}
