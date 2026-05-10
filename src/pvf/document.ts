import { BufferReader } from "./buffer-reader";
import type { PvfStringContext } from "./types";

/** ValueType enum (C++ ValueType.h) */
enum ValueType {
	Int = 2,
	IntEx = 3,
	Float = 4,
	Section = 5,
	Command = 6,
	String = 7,
	CommandSeparator = 8,
	StringLinkIndex = 9,
	StringLink = 10,
}

export interface DocNode {
	name: string;
	attributes: DocAttribute[];
	children: Map<string, DocNode[]>;
	hasEndTag: boolean;
}

export interface DocAttribute {
	type: "int" | "float" | "string";
	value: number | string;
}

export interface DocTree {
	root: DocNode;
}

function createNode(name: string, hasEndTag: boolean): DocNode {
	return { name, attributes: [], children: new Map(), hasEndTag };
}

/**
 * 解析二进制 Document 文件
 * C++ 参考: PvfDocument::unpack()
 *
 * ctx.binMap 中的值格式:
 * - 开标签: "[tagname]"
 * - 闭标签: "[/tagname]"
 * - 普通字符串: "some_text"
 */
export function parseDocument(buffer: Buffer, ctx: PvfStringContext): DocTree {
	const root = createNode("root", false);

	if (buffer.length <= 7) {
		return { root };
	}

	const reader = new BufferReader(buffer);
	const _header = reader.readInt16(); // magic header (2)

	// First pass: collect all section tag names to determine hasEndTag
	// C++ 中 tags 存储的是 ctx.binMap[index] 的原始值（包含 [ 和 ]）
	const tags = new Set<string>();
	while (reader.getRemaining() > 4) {
		const type = reader.readUint8();
		if (type >= 2 && type <= 10) {
			const index = reader.readInt32();
			if (type === ValueType.Section) {
				const name = ctx.binMap[index] || "";
				tags.add(name);
			}
		}
	}

	// Second pass: build tree
	reader.setOffset(2);
	let node: DocNode = root;
	const stack: DocNode[] = [root];

	function popStack(targetName: string): void {
		while (stack.length > 1) {
			const top = stack[stack.length - 1];
			if (!top) return;
			if (top.name === targetName) {
				stack.pop();
				const next = stack[stack.length - 1];
				if (next) node = next;
				return;
			}
			stack.pop();
			const next = stack[stack.length - 1];
			if (next) node = next;
		}
	}

	while (reader.getRemaining() > 4) {
		const type = reader.readUint8();
		if (type < 2 || type > 10) continue;

		const index = reader.readInt32();

		switch (type) {
			case ValueType.Int:
			case ValueType.IntEx: {
				node.attributes.push({ type: "int", value: index });
				break;
			}

			case ValueType.Float: {
				const buf = Buffer.alloc(4);
				buf.writeInt32LE(index, 0);
				const f = buf.readFloatLE(0);
				node.attributes.push({ type: "float", value: f });
				break;
			}

			case ValueType.Section: {
				// ctx.binMap[index] 的值格式: "[tagname]" 或 "[/tagname]"
				const rawName = ctx.binMap[index] || "";

				if (rawName.startsWith("[/") && rawName.endsWith("]")) {
					// 闭标签: "[/tagname]" → 提取 "tagname"
					const tagName = rawName.slice(2, -1);
					popStack(tagName);
				} else {
					// 开标签: "[tagname]" → 提取 "tagname"
					const tagName = rawName.replace(/^\[/, "").replace(/\]$/, "");

					// 构造对应的闭标签名检查是否有 endTag
					const endTagName = `[/${tagName}]`;

					// 如果当前节点没有 endTag，需要先弹出
					if (node !== root && !node.hasEndTag) {
						if (stack.length > 1) {
							stack.pop();
							const next = stack[stack.length - 1];
							if (next) node = next;
						}
					}

					const childNode = createNode(tagName, tags.has(endTagName));
					const children = node.children.get(tagName);
					if (children) {
						children.push(childNode);
					} else {
						node.children.set(tagName, [childNode]);
					}
					stack.push(childNode);
					node = childNode;
				}
				break;
			}

			case ValueType.String: {
				const str = ctx.binMap[index] || "";
				node.attributes.push({ type: "string", value: str });
				break;
			}

			case ValueType.Command:
			case ValueType.CommandSeparator: {
				const str = ctx.binMap[index] || "";
				node.attributes.push({ type: "string", value: str });
				break;
			}

			case ValueType.StringLink: {
				const key = ctx.binMap[index] || "";
				const resolved = ctx.stringMap.get(key) || key;
				node.attributes.push({ type: "string", value: resolved });
				break;
			}
		}
	}

	return { root };
}
