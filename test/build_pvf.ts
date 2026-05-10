import { writeFileSync } from "node:fs";

const PASSWORD_PVF = 0x81a79011;

// CRC32 查表法
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let j = 0; j < 8; j++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	crc32Table[i] = c;
}
function crc32(buf: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc = crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function rotateLeft32(x: number, n: number): number {
	x = x >>> 0;
	return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function encryptPvfData(data: Uint8Array, len: number, crc: number): void {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const wordCount = Math.floor(len / 4);
	const key = (PASSWORD_PVF ^ crc) >>> 0;

	for (let i = 0; i < wordCount; i++) {
		const offset = i * 4;
		const value = view.getUint32(offset, true);
		const encrypted = (rotateLeft32(value, 6) ^ key) >>> 0;
		view.setUint32(offset, encrypted, true);
	}
}

function writeToken(
	buf: Buffer,
	offset: number,
	type: number,
	value: number,
): number {
	buf.writeUInt8(type, offset);
	buf.writeInt32LE(value, offset + 1);
	return offset + 5;
}

/**
 * 构建 ScriptFile 二进制内容
 * 前 2 字节 0xD0B0，之后是 5 字节 token 流
 */
function buildScriptFileContent(): Buffer {
	// token 流: Section("section_name") + Int(42) + Float(3.14)
	// stringBinMap 索引: 0="[section_name]", 1="some_string"
	const buf = Buffer.alloc(2 + 5 * 3 + 10); // header + 3 tokens + padding
	let off = 0;
	// header
	buf.writeUInt16LE(0xd0b0, off);
	off += 2;
	// Section token (type=5, index=0 → "[section_name]")
	off = writeToken(buf, off, 5, 0);
	// Int token (type=2, value=42)
	off = writeToken(buf, off, 2, 42);
	// Float token (type=4, 需要写入浮点的 int32 表示)
	const floatBuf = Buffer.alloc(4);
	floatBuf.writeFloatLE(3.14, 0);
	off = writeToken(buf, off, 4, floatBuf.readInt32LE(0));
	return buf.subarray(0, off);
}

/**
 * 构建 Binary ANI 二进制内容
 */
function buildAniContent(): Buffer {
	// 2 帧, 1 个资源路径, 0 个动画级参数
	const resources = ["test/resource.img\0"];
	const resLen = Buffer.byteLength(resources[0], "ascii");

	// framesCount(2) + countOfResources(2) + resLen(4) + resStr + paramsCount(2) + 2 frames * (boxes(2) + imgId(2) + imgParam(2) + x(4) + y(4) + propCount(2))
	const frameSize = 2 + 2 + 2 + 4 + 4 + 2; // boxes=0, imgId, imgParam, x, y, propertyCount=0
	const totalSize = 2 + 2 + 4 + resLen + 2 + frameSize * 2;

	const buf = Buffer.alloc(totalSize);
	let off = 0;

	// framesCount = 2
	buf.writeUInt16LE(2, off);
	off += 2;
	// countOfResources = 1
	buf.writeUInt16LE(1, off);
	off += 2;
	// resource string length
	buf.writeInt32LE(resLen, off);
	off += 4;
	// resource string
	buf.write(resources[0], off, "ascii");
	off += resLen;
	// animation-level params count = 0
	buf.writeUInt16LE(0, off);
	off += 2;

	// Frame 0
	buf.writeUInt16LE(0, off);
	off += 2; // boxes = 0
	buf.writeInt16LE(0, off);
	off += 2; // imgId = 0
	buf.writeUInt16LE(0, off);
	off += 2; // imgParam = 0
	buf.writeInt32LE(10, off);
	off += 4; // x = 10
	buf.writeInt32LE(20, off);
	off += 4; // y = 20
	buf.writeUInt16LE(0, off);
	off += 2; // propertyCount = 0

	// Frame 1
	buf.writeUInt16LE(0, off);
	off += 2; // boxes = 0
	buf.writeInt16LE(0, off);
	off += 2; // imgId = 0
	buf.writeUInt16LE(0, off);
	off += 2; // imgParam = 0
	buf.writeInt32LE(30, off);
	off += 4; // x = 30
	buf.writeInt32LE(40, off);
	off += 4; // y = 40
	buf.writeUInt16LE(0, off);
	off += 2; // propertyCount = 0

	return buf.subarray(0, off);
}

// 创建假的 PVF 文件
function buildFakePvf(): Buffer {
	const dirTreeChecksum = 0xaabbccdd;
	const fileVersion = 1;

	// 文件1: test/hello.txt (纯文本)
	const path1 = "test/hello.txt";
	const content1 = Buffer.from("Hello, PVF!", "utf-8");
	const crc1 = crc32(content1);

	// 文件2: test/world.bin (原始二进制)
	const path2 = "test/world.bin";
	const content2 = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
	const crc2 = crc32(content2);

	// 文件3: test/character.ai (ScriptFile, 0xD0B0)
	const path3 = "test/character.ai";
	const content3 = buildScriptFileContent();
	const crc3 = crc32(content3);

	// 文件4: test/move.ani (Binary ANI)
	const path4 = "test/move.ani";
	const content4 = buildAniContent();
	const crc4 = crc32(content4);

	const files: {
		path: string;
		content: Buffer;
		crc: number;
		alignedLength: number;
		relativeOffset: number;
	}[] = [
		{
			path: path1,
			content: content1,
			crc: crc1,
			alignedLength: 0,
			relativeOffset: 0,
		},
		{
			path: path2,
			content: content2,
			crc: crc2,
			alignedLength: 0,
			relativeOffset: 0,
		},
		{
			path: path3,
			content: content3,
			crc: crc3,
			alignedLength: 0,
			relativeOffset: 0,
		},
		{
			path: path4,
			content: content4,
			crc: crc4,
			alignedLength: 0,
			relativeOffset: 0,
		},
	];

	// 计算每个文件的对齐长度和相对偏移
	let totalDataLength = 0;
	for (const f of files) {
		f.alignedLength = (f.content.length + 3) & 0xfffffffc;
		f.relativeOffset = totalDataLength;
		totalDataLength += f.alignedLength;
	}

	// 构建目录树（明文）
	let dirTreeSize = 0;
	for (const f of files) {
		const pathBytes = Buffer.from(`${f.path}\0`, "latin1");
		dirTreeSize += 4 + 4 + pathBytes.length + 4 + 4 + 4;
	}

	const dirTree = Buffer.alloc(dirTreeSize);
	let offset = 0;

	for (let i = 0; i < files.length; i++) {
		const f = files[i];
		const pathBytes = Buffer.from(`${f.path}\0`, "latin1");

		dirTree.writeUInt32LE(i, offset);
		offset += 4;
		dirTree.writeInt32LE(pathBytes.length, offset);
		offset += 4;
		pathBytes.copy(dirTree, offset);
		offset += pathBytes.length;
		dirTree.writeInt32LE(f.content.length, offset);
		offset += 4;
		dirTree.writeUInt32LE(f.crc, offset);
		offset += 4;
		dirTree.writeInt32LE(f.relativeOffset, offset);
		offset += 4;
	}

	// 加密目录树
	const dirTreeEncrypted = new Uint8Array(dirTree);
	encryptPvfData(dirTreeEncrypted, dirTreeSize, dirTreeChecksum);

	// 构建文件数据区
	const dataSection = Buffer.alloc(totalDataLength);
	for (const f of files) {
		f.content.copy(dataSection, f.relativeOffset);

		// 加密每个文件的数据
		const encrypted = new Uint8Array(
			dataSection.subarray(
				f.relativeOffset,
				f.relativeOffset + f.alignedLength,
			),
		);
		encryptPvfData(encrypted, f.alignedLength, f.crc);
		Buffer.from(encrypted).copy(dataSection, f.relativeOffset);
	}

	// 构建 Header
	const header = Buffer.alloc(56);
	header.writeInt32LE(0x24, 0);
	header.writeInt32LE(fileVersion, 40);
	header.writeInt32LE(dirTreeSize, 44);
	header.writeUInt32LE(dirTreeChecksum, 48);
	header.writeInt32LE(files.length, 52);

	return Buffer.concat([header, Buffer.from(dirTreeEncrypted), dataSection]);
}

const pvfData = buildFakePvf();
writeFileSync("test/fake.pvf", pvfData);
console.log(`Generated fake.pvf (${pvfData.length} bytes, 4 files)`);
