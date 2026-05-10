function formatFloat(value: number): string {
	const text = value.toString();
	return text.includes(".") ? text : `${text}.0`;
}

/**
 * 判断文件是否为 PVF ScriptFile
 * ScriptFile 的前 2 字节固定为 0xb0 0xd0（小端读取为 0xd0b0）
 */
export function isScriptFile(data: Buffer): boolean {
	return data.length >= 2 && data.readUInt16LE(0) === 0xd0b0;
}

/**
 * 反编译 PVF ScriptFile 为文本格式
 * 参考 PVF-X-Mate-WINUI3 的 ScriptFileCompiler.Decompile
 *
 * Token 结构（从第 2 字节开始）：
 *   [type: 1 byte][data: 4 bytes] 重复，每 5 字节一组
 *
 * Type 定义：
 *   2 = Int          → 输出数字 + tab
 *   3 = IntEx        → 输出 {3=value} + tab
 *   4 = Float        → 输出格式化浮点数 + tab
 *   5 = Section      → 输出换行 + [name] + 换行
 *   6 = Command      → 输出 {6=`str`} + 换行
 *   7 = String       → 输出 `str` + 换行
 *   8 = CommandSeparator → 输出 {8=`str`} + 换行
 *   9 = StringLinkIndex → 跳过，由 type 10 处理
 *  10 = StringLink   → 输出 `resolved` + 换行（或 <id::name`resolved`>）
 */
export function decompileScriptFile(
	data: Buffer,
	stringBinMap: string[],
	stringStringMap: Map<string, string>,
): string {
	if (data.length < 7) {
		return "#PVF_File\r\n";
	}

	let result = "#PVF_File\r\n";

	for (let index = 2; index < data.length - 4; index += 5) {
		const type = data[index];
		const value = data.readInt32LE(index + 1);

		switch (type) {
			case 5: {
				// Section
				const name = stringBinMap[value] || "";
				result += `\r\n${name}\r\n`;
				break;
			}

			case 10: {
				// StringLink: 前一个 token 必须是 type 9（StringLinkIndex）
				const _strListNumber = index >= 7 ? data.readInt32LE(index - 4) : 0;
				const strName = stringBinMap[value] || "";
				const resolved = stringStringMap.get(strName) || strName;
				result += `\`${resolved.replace(/\\n/g, "\r\n")}\`\r\n`;
				break;
			}

			case 7: {
				// String
				const str = stringBinMap[value] || "";
				result += `\`${str}\`\r\n`;
				break;
			}

			case 6:
			case 8: {
				// Command / CommandSeparator
				const str = stringBinMap[value] || "";
				result += `{${type}=\`${str}\`}\r\n`;
				break;
			}

			case 3: {
				// IntEx
				result += `{${type}=${value}}\t`;
				break;
			}

			case 4: {
				// Float
				const f = data.readFloatLE(index + 1);
				result += `${formatFloat(f)}\t`;
				break;
			}

			case 2: {
				// Int
				result += `${value}\t`;
				break;
			}

			case 9: {
				// StringLinkIndex: 跳过，由 type 10 处理
				break;
			}

			default: {
				// 未知类型，忽略
				break;
			}
		}
	}

	result += "\r\n";
	return result;
}
