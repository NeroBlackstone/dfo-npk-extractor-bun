import type { AniData } from "./ani-binary";

/**
 * 将解析后的 .ani 数据序列化为文本格式
 * 输出格式与 test/test.ani 一致
 */
export function serializeAniToText(data: AniData): string {
	const lines: string[] = [];

	lines.push("#PVF_File");
	lines.push("");
	lines.push("[FRAME MAX]");
	lines.push(`\t${data.framesCount}`);

	for (let i = 0; i < data.frames.length; i++) {
		const frame = data.frames[i];
		if (!frame) continue;
		lines.push("");
		lines.push(`[FRAME${String(i).padStart(3, "0")}]`);

		// [IMAGE]
		lines.push(`\t[IMAGE]`);
		lines.push(`\t\`${frame.path}\``);
		lines.push(`\t${frame.imgId}`);

		// [IMAGE POS]
		lines.push(`\t[IMAGE POS]`);
		lines.push(`\t${frame.x}\t${frame.y}`);

		// [DELAY]
		lines.push(`\t[DELAY]`);
		lines.push(`\t${frame.delay}`);

		// [DAMAGE BOX]
		for (const box of frame.damageBox) {
			lines.push(`\t[DAMAGE BOX]`);
			lines.push(`\t${box.values.join("\t")}`);
		}

		// [ATTACK BOX]
		for (const box of frame.attackBox) {
			lines.push(`\t[ATTACK BOX]`);
			lines.push(`\t${box.values.join("\t")}`);
		}
	}

	return lines.join("\r\n");
}
