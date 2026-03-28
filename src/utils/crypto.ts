/** XOR密钥缓存 */
let _key: Uint8Array | null = null;

/**
 * 生成256字节XOR密钥 (带缓存)
 * 算法来源: NpkCoder.cs:30-44
 */
export function generateKey(): Uint8Array {
	/** XOR加密密钥头部 */
	const KEY_HEADER = "puchikon@neople dungeon and fighter ";

	if (_key) return _key;

	const key = new Uint8Array(256);
	const headerBytes = new TextEncoder().encode(KEY_HEADER);

	// 填充header
	key.set(headerBytes);

	// 用DNF循环填充剩余位置
	for (let i = headerBytes.length; i < 255; i++) {
		key[i] = "DNF".charCodeAt(i % 3);
	}
	key[255] = 0;

	_key = key;
	return key;
}

/**
 * XOR解密路径
 * 算法来源: NpkCoder.cs:51-63
 * NPK文件中路径字段固定256字节，需要找解密后真正的null终止符
 */
export function decryptPath(
	encryptedData: Uint8Array,
	key: Uint8Array,
): string {
	// 解密所有字节，同时找解密后的null位置
	let nullIndex = -1;
	const decrypted = new Uint8Array(encryptedData.length);

	for (let i = 0; i < encryptedData.length; i++) {
		decrypted[i] = (encryptedData[i] as number) ^ (key[i] as number);
		if (decrypted[i] === 0 && nullIndex === -1) {
			nullIndex = i;
			break;
		}
	}

	// 如果没找到null，用整个数组
	if (nullIndex === -1) {
		nullIndex = encryptedData.length;
	}

	return new TextDecoder().decode(decrypted.subarray(0, nullIndex));
}

/**
 * XOR加密路径
 * 返回加密后的数据（只到null终止符，不返回256字节）
 */
export function encryptPath(path: string, key: Uint8Array): Uint8Array {
	const encoder = new TextEncoder();
	const pathBytes = encoder.encode(path);
	const encrypted = new Uint8Array(pathBytes.length + 1); // +1 for null terminator

	for (let i = 0; i < pathBytes.length; i++) {
		encrypted[i] = (pathBytes[i] as number) ^ (key[i] as number);
	}
	// null terminated: set to key[i] so that key[i] ^ key[i] = 0 when decrypting
	encrypted[pathBytes.length] = key[pathBytes.length] as number;

	return encrypted;
}
