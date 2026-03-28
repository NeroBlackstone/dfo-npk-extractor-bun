// NPK文件标志
export const NPK_FLAG = "NeoplePack_Bill";

// XOR加密密钥头部
export const KEY_HEADER = "puchikon@neople dungeon and fighter ";

export interface NpkAlbum {
	offset: number; // 文件偏移
	length: number; // 文件长度
	path: string; // 解密后的路径
}
