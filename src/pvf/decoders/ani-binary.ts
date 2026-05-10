import { BufferReader } from "../buffer-reader";

/** AnimationNodeType enum (C++ PvfAnimation.h) */
enum AnimationNodeType {
	LOOP = 0,
	SHADOW = 1,
	UNKNOWN_2 = 2,
	COORD = 3,
	UNKNOWN_4 = 4,
	UNKNOWN_5 = 5,
	UNKNOWN_6 = 6,
	IMAGE_RATE = 7,
	IMAGE_ROTATE = 8,
	RGBA = 9,
	INTERPOLATION = 10,
	GRAPHIC_EFFECT = 11,
	DELAY = 12,
	DAMAGE_TYPE = 13,
	DAMAGE_BOX = 14,
	ATTACK_BOX = 15,
	PLAY_SOUND = 16,
	PRELOAD = 17,
	SPECTRUM = 18,
	UNKNOWN_19 = 19,
	UNKNOWN_20 = 20,
	UNKNOWN_21 = 21,
	UNKNOWN_22 = 22,
	SET_FLAG = 23,
	FLIP_TYPE = 24,
	LOOP_START = 25,
	LOOP_END = 26,
	CLIP = 27,
	OPERATION = 28,
}

enum EffectItem {
	NONE = 0,
	DODGE = 1,
	LINEARDODGE = 2,
	DARK = 3,
	XOR = 4,
	MONOCHROME = 5,
	SPACEDISTORT = 6,
}

enum FlipType {
	HORIZON = 1,
	VERTICAL = 2,
	ALL = 3,
}

export interface AniBox {
	type: number; // DAMAGE_BOX or ATTACK_BOX
	values: [number, number, number, number, number, number];
}

export interface AniFrame {
	x: number;
	y: number;
	imgId: number;
	imgParam: number;
	path: string;
	rateX: number;
	rateY: number;
	rotate: number;
	color: number;
	itemType: number;
	effectColor?: { r: number; g: number; b: number };
	effectPos?: { x: number; y: number };
	delay: number;
	damageType: number;
	sound: string;
	setFlag: number;
	flipType: number;
	loopStart: boolean;
	loopEnd: number;
	clip: [number, number, number, number];
	coord: number;
	loop: boolean;
	shadow: boolean;
	interpolation: boolean;
	damageBox: AniBox[];
	attackBox: AniBox[];
}

export interface AniData {
	framesCount: number;
	resources: string[];
	loop: boolean;
	shadow: boolean;
	frames: AniFrame[];
}

function defaultFrame(): AniFrame {
	return {
		x: 0,
		y: 0,
		imgId: 0,
		imgParam: 0,
		path: "",
		rateX: 1,
		rateY: 1,
		rotate: 0,
		color: 0xffffffff,
		itemType: 0,
		delay: 50,
		damageType: 0,
		sound: "",
		setFlag: 0,
		flipType: 0,
		loopStart: false,
		loopEnd: 0,
		clip: [0, 0, 0, 0],
		coord: 0,
		loop: false,
		shadow: false,
		interpolation: false,
		damageBox: [],
		attackBox: [],
	};
}

/**
 * 解析二进制 .ani 文件
 * C++ 参考: PvfAnimation::unpack()
 */
export function parseBinaryAni(buffer: Buffer): AniData {
	// 检查是否已经是文本格式
	if (buffer.length > 0 && buffer[0] === 0x23) {
		// 0x23 = '#', 可能是 #PVF_File 文本格式
		const head = buffer.toString("ascii", 0, Math.min(9, buffer.length));
		if (head.startsWith("#PVF_File")) {
			throw new Error("File is already in text format");
		}
	}

	const reader = new BufferReader(buffer);

	const framesCount = reader.readUint16();
	const countOfResources = reader.readUint16();

	// 读取资源路径字符串
	const resources: string[] = [];
	for (let i = 0; i < countOfResources; i++) {
		const len = reader.readInt32();
		let str = reader.readAsciiString(len).replace(/\0/g, "");
		str = str.toLowerCase();
		resources.push(str);
	}

	// 读取动画级参数
	let loop = false;
	let shadow = false;
	const params = reader.readUint16();
	for (let j = 0; j < params; j++) {
		const type = reader.readUint16();
		switch (type) {
			case AnimationNodeType.LOOP:
				loop = reader.readInt8() !== 0;
				break;
			case AnimationNodeType.SHADOW:
				shadow = reader.readInt8() !== 0;
				break;
			case AnimationNodeType.COORD:
			case AnimationNodeType.OPERATION:
				reader.readUint16(); // 2 bytes
				break;
			case AnimationNodeType.SPECTRUM:
				reader.readUint8(); // 1 byte
				reader.readInt32(); // term
				reader.readInt32(); // life time
				reader.readUint8();
				reader.readUint8();
				reader.readUint8();
				reader.readUint8(); // 4 colors
				reader.readUint16(); // effect
				break;
		}
	}

	// 读取帧数据
	const frames: AniFrame[] = [];
	for (let i = 0; i < framesCount; i++) {
		const frame = defaultFrame();

		// 读取碰撞盒
		const boxes = reader.readUint16();
		for (let j = 0; j < boxes; j++) {
			const type = reader.readUint16();
			const values: [number, number, number, number, number, number] = [
				0, 0, 0, 0, 0, 0,
			];
			for (let m = 0; m < 6; m++) {
				values[m] = reader.readInt32();
			}
			if (type === 14) {
				frame.damageBox.push({ type, values });
			} else {
				frame.attackBox.push({ type, values });
			}
		}

		frame.imgId = reader.readInt16();
		if (frame.imgId >= 0) {
			frame.imgParam = reader.readUint16();
		}
		frame.path = frame.imgId >= 0 ? resources[frame.imgId] || "" : "";

		frame.x = reader.readInt32();
		frame.y = reader.readInt32();

		// 读取帧属性
		const propertyCount = reader.readUint16();
		for (let m = 0; m < propertyCount; m++) {
			const type = reader.readUint16() as AnimationNodeType;
			switch (type) {
				case AnimationNodeType.LOOP:
					frame.loop = reader.readInt8() !== 0;
					break;
				case AnimationNodeType.SHADOW:
					frame.shadow = reader.readInt8() !== 0;
					break;
				case AnimationNodeType.INTERPOLATION:
					frame.interpolation = reader.readInt8() !== 0;
					break;
				case AnimationNodeType.UNKNOWN_2:
				case AnimationNodeType.UNKNOWN_4:
				case AnimationNodeType.UNKNOWN_5:
				case AnimationNodeType.UNKNOWN_6:
				case AnimationNodeType.DAMAGE_BOX:
				case AnimationNodeType.ATTACK_BOX:
				case AnimationNodeType.SPECTRUM:
				case AnimationNodeType.UNKNOWN_19:
				case AnimationNodeType.UNKNOWN_20:
				case AnimationNodeType.UNKNOWN_21:
				case AnimationNodeType.UNKNOWN_22:
					break;
				case AnimationNodeType.COORD:
					frame.coord = reader.readUint16();
					break;
				case AnimationNodeType.IMAGE_RATE:
					frame.rateX = reader.readFloat();
					frame.rateY = reader.readFloat();
					break;
				case AnimationNodeType.IMAGE_ROTATE:
					frame.rotate = reader.readFloat();
					break;
				case AnimationNodeType.RGBA:
					frame.color =
						(reader.readUint8() |
							(reader.readUint8() << 8) |
							(reader.readUint8() << 16) |
							(reader.readUint8() << 24)) >>>
						0;
					break;
				case AnimationNodeType.GRAPHIC_EFFECT:
					frame.itemType = reader.readUint16();
					if (frame.itemType === EffectItem.MONOCHROME) {
						frame.effectColor = {
							r: reader.readUint8(),
							g: reader.readUint8(),
							b: reader.readUint8(),
						};
					} else if (frame.itemType === EffectItem.SPACEDISTORT) {
						frame.effectPos = {
							x: reader.readInt16(),
							y: reader.readInt16(),
						};
					}
					break;
				case AnimationNodeType.DELAY:
					frame.delay = reader.readInt32();
					break;
				case AnimationNodeType.DAMAGE_TYPE:
					frame.damageType = reader.readUint16();
					break;
				case AnimationNodeType.PLAY_SOUND: {
					const soundLen = reader.readInt32();
					frame.sound = reader.readAsciiString(soundLen);
					break;
				}
				case AnimationNodeType.PRELOAD:
					break;
				case AnimationNodeType.SET_FLAG:
					frame.setFlag = reader.readInt32();
					break;
				case AnimationNodeType.FLIP_TYPE:
					frame.flipType = reader.readUint16();
					break;
				case AnimationNodeType.LOOP_START:
					frame.loopStart = true;
					break;
				case AnimationNodeType.LOOP_END:
					frame.loopEnd = reader.readInt32();
					break;
				case AnimationNodeType.CLIP:
					frame.clip[0] = reader.readInt16();
					frame.clip[1] = reader.readInt16();
					frame.clip[2] = reader.readInt16();
					frame.clip[3] = reader.readInt16();
					break;
			}
		}

		frames.push(frame);
	}

	return { framesCount, resources, loop, shadow, frames };
}
