import { decodeAuto } from "../encoding";

/**
 * Convert .str file (Big5/EUC-KR text) to JSON object.
 * Format: key>value per line, // comments and blank lines are skipped.
 */
export function convertStrToJson(data: Buffer): string {
	const text = decodeAuto(data);
	const obj: Record<string, string> = {};

	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("//")) continue;

		const idx = trimmed.indexOf(">");
		if (idx === -1) continue;

		const key = trimmed.slice(0, idx).trim();
		const value = trimmed.slice(idx + 1).trim();
		if (key) {
			obj[key] = value;
		}
	}

	return JSON.stringify(obj, null, 2);
}
