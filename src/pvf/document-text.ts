import type { DocNode, DocTree } from "./document";

const NL = "\r\n";

/**
 * 将 Document 树序列化为文本格式
 * 格式: #PVF_File + 缩进的标签树
 */
export function serializeDocumentToText(tree: DocTree): string {
	const lines: string[] = [];
	lines.push("#PVF_File");
	lines.push("");
	serializeNode(tree.root, lines, 0);
	return lines.join(NL);
}

function serializeNode(node: DocNode, lines: string[], depth: number): void {
	const indent = "\t".repeat(depth);

	// 输出属性
	for (const attr of node.attributes) {
		switch (attr.type) {
			case "int":
				lines.push(`${indent}${attr.value}`);
				break;
			case "float":
				lines.push(`${indent}${attr.value}`);
				break;
			case "string":
				lines.push(`${indent}\`${attr.value}\``);
				break;
		}
	}

	// 输出子节点
	for (const [name, children] of node.children) {
		for (const child of children) {
			lines.push(`${indent}[${name}]`);
			serializeNode(child, lines, depth + 1);
			if (child.hasEndTag) {
				lines.push(`${indent}[/${name}]`);
			}
		}
	}
}
