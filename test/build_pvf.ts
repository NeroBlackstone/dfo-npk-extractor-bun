import { writeFileSync } from "node:fs";

const PASSWORD_PVF = 0x81a79011;

function rotateLeft32(x: number, n: number): number {
	x = x >>> 0;
	return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function encryptPvfData(data: Uint8Array, len: number, crc32: number): void {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const wordCount = Math.floor(len / 4);
	const key = ((PASSWORD_PVF ^ crc32) >>> 0);

	for (let i = 0; i < wordCount; i++) {
		const offset = i * 4;
		const value = view.getUint32(offset, true);
		const encrypted = (rotateLeft32(value, 6) ^ key) >>> 0;
		view.setUint32(offset, encrypted, true);
	}
}

// 创建假的 PVF 文件
function buildFakePvf(): Buffer {
	const dirTreeChecksum = 0xaabbccdd;
	const fileVersion = 1;

	// 文件1: test/hello.txt
	const path1 = "test/hello.txt";
	const content1 = Buffer.from("Hello, PVF!", "utf-8"); // 11 bytes
	const crc1 = 0x12345678;

	// 文件2: test/world.bin
	const path2 = "test/world.bin";
	const content2 = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]); // 5 bytes
	const crc2 = 0x87654321;

	// 构建目录树（明文）
	const path1Bytes = Buffer.from(path1 + "\0", "latin1");
	const path2Bytes = Buffer.from(path2 + "\0", "latin1");

	const entry1Size = 4 + 4 + path1Bytes.length + 4 + 4 + 4;
	const entry2Size = 4 + 4 + path2Bytes.length + 4 + 4 + 4;
	const dirTreeLength = entry1Size + entry2Size;

	const dirTree = Buffer.alloc(dirTreeLength);
	let offset = 0;

	// 条目1
	dirTree.writeUInt32LE(0, offset); offset += 4;
	dirTree.writeInt32LE(path1Bytes.length, offset); offset += 4;
	path1Bytes.copy(dirTree, offset); offset += path1Bytes.length;
	dirTree.writeInt32LE(content1.length, offset); offset += 4;
	dirTree.writeUInt32LE(crc1, offset); offset += 4;
	dirTree.writeInt32LE(0, offset); offset += 4;

	// 条目2
	const content1Aligned = (content1.length + 3) & 0xfffffffc;
	dirTree.writeUInt32LE(1, offset); offset += 4;
	dirTree.writeInt32LE(path2Bytes.length, offset); offset += 4;
	path2Bytes.copy(dirTree, offset); offset += path2Bytes.length;
	dirTree.writeInt32LE(content2.length, offset); offset += 4;
	dirTree.writeUInt32LE(crc2, offset); offset += 4;
	dirTree.writeInt32LE(content1Aligned, offset); offset += 4;

	// 加密目录树
	const dirTreeEncrypted = new Uint8Array(dirTree);
	encryptPvfData(dirTreeEncrypted, dirTreeLength, dirTreeChecksum);

	// 构建文件数据区（明文）
	const content2Aligned = (content2.length + 3) & 0xfffffffc;
	const dataSectionLength = content1Aligned + content2Aligned;
	const dataSection = Buffer.alloc(dataSectionLength);
	content1.copy(dataSection, 0);
	content2.copy(dataSection, content1Aligned);

	// 分别加密每个文件的数据
	const data1Encrypted = new Uint8Array(dataSection.subarray(0, content1Aligned));
	encryptPvfData(data1Encrypted, content1Aligned, crc1);
	Buffer.from(data1Encrypted).copy(dataSection, 0);

	const data2Encrypted = new Uint8Array(dataSection.subarray(content1Aligned, content1Aligned + content2Aligned));
	encryptPvfData(data2Encrypted, content2Aligned, crc2);
	Buffer.from(data2Encrypted).copy(dataSection, content1Aligned);

	// 构建 Header
	const header = Buffer.alloc(56);
	header.writeInt32LE(0x24, 0);
	header.writeInt32LE(fileVersion, 40);
	header.writeInt32LE(dirTreeLength, 44);
	header.writeUInt32LE(dirTreeChecksum, 48);
	header.writeInt32LE(2, 52);

	return Buffer.concat([header, Buffer.from(dirTreeEncrypted), dataSection]);
}

const pvfData = buildFakePvf();
writeFileSync("test/fake.pvf", pvfData);
console.log(`Generated fake.pvf (${pvfData.length} bytes)`);
