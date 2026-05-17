import { BufferReader } from "./buffer-reader";
import type { PvfStringContext } from "./types";

/**
 * 解析 name-list .lst 文件为 ID→name 映射
 *
 * ScriptFile 格式 (0xD0B0 header)：
 * - Token: [type: 1 byte][data: 4 bytes LE]
 * - name-list 中每条记录为 [Int:id][String:name] 或 [String:name][Int:id]
 * - String (type 7) 通过 binMap[value] 解析
 *
 * @returns 可序列化对象，解析失败返回 null
 */
export function convertNameList(
	data: Buffer,
	ctx: PvfStringContext,
): Record<string, string> | null {
	if (data.length < 4) return null;

	const reader = new BufferReader(data);

	// 跳过 ScriptFile header (0xD0B0)
	reader.readUint16();

	const entries: { id: number; name: string }[] = [];
	let pendingId: number | null = null;
	let pendingName: string | null = null;

	while (reader.getRemaining() >= 5) {
		const type = reader.readUint8();
		const value = reader.readInt32();

		switch (type) {
			case 2: {
				// Int — 可能是 ID
				if (pendingName !== null) {
					// [String][Int] 顺序：name 在前，id 在后
					entries.push({ id: value, name: pendingName });
					pendingName = null;
				} else {
					pendingId = value;
				}
				break;
			}

			case 7: {
				// String — 通过 binMap 解析为名称
				const name = ctx.binMap[value] || "";
				if (pendingId !== null) {
					// [Int][String] 顺序：id 在前，name 在后
					entries.push({ id: pendingId, name });
					pendingId = null;
				} else {
					pendingName = name;
				}
				break;
			}

			default: {
				pendingId = null;
				pendingName = null;
				break;
			}
		}
	}

	if (entries.length === 0) return null;

	const obj: Record<string, string> = {};
	for (const { id, name } of entries) {
		obj[id] = name;
	}
	return obj;
}
