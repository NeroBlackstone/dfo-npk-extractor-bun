/**
 * 判断文件是否为 PVF ScriptFile
 * ScriptFile 的前 2 字节固定为 0xb0 0xd0（小端读取为 0xd0b0）
 */
export function isScriptFile(data: Buffer): boolean {
	return data.length >= 2 && data.readUInt16LE(0) === 0xd0b0;
}
