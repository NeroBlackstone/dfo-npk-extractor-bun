import type { PvfStringContext } from "../types";

export interface ScriptFileParseOptions {
	/** 是否将 StringLink 解析为实际翻译文本（默认 false，输出 @listId::keyName） */
	resolveStringLink?: boolean;
}

interface Token {
	type: number;
	value: number;
	floatValue?: number;
	strValue?: string;
	listId?: number;
}

function formatFloat(value: number): string {
	const text = value.toString();
	return text.includes(".") ? text : `${text}.0`;
}

function normalizeKey(name: string): string {
	return name.replace(/[[\]]/g, "").replace(/ /g, "_");
}

function getSectionName(name: string): string {
	if (name.startsWith("[/")) {
		return name.slice(2, -1);
	}
	return name.replace(/[[\]]/g, "");
}

function isClosingSection(name: string): boolean {
	return name.startsWith("[/");
}

export function parseScriptFileToJson(
	data: Buffer,
	ctx: PvfStringContext,
	options?: ScriptFileParseOptions,
): unknown[] {
	if (data.length < 7) {
		return [];
	}

	const resolveStringLink = options?.resolveStringLink ?? false;
	const tokens = parseTokens(data, ctx);
	const closingMap = buildClosingMap(tokens);
	const sectionMap = buildSectionMap(tokens);

	return parseSections(tokens, ctx, sectionMap, closingMap, 0, resolveStringLink);
}

function parseTokens(data: Buffer, ctx: PvfStringContext): Token[] {
	const tokens: Token[] = [];

	for (let index = 2; index < data.length - 4; index += 5) {
		const byte = data[index];
		if (byte === undefined) break;
		const type = byte;
		const value = data.readInt32LE(index + 1);

		const token: Token = { type, value };

		if (type === 4) {
			token.floatValue = data.readFloatLE(index + 1);
		} else if (type === 9) {
			// StringLinkIndex: store the listId for the next type 10 token
			token.listId = value;
		} else if (
			type === 5 ||
			type === 6 ||
			type === 7 ||
			type === 8 ||
			type === 10
		) {
			token.strValue = ctx.binMap[value] || "";
		}

		tokens.push(token);
	}

	return tokens;
}

function buildClosingMap(tokens: Token[]): Map<string, number> {
	const closing = new Map<string, number>();
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) break;
		if (token.type === 5 && token.strValue) {
			const name = token.strValue;
			if (isClosingSection(name)) {
				closing.set(getSectionName(name), i);
			}
		}
	}
	return closing;
}

interface SectionInfo {
	isContainer: boolean;
	idx: number;
}

/**
 * 合并为一遍：同时构建 sectionMap 和 closingMap
 * 用 stack 跟踪当前嵌套层级，遇到 closing 时判断前面的 opening 是否是 container
 */
function buildSectionMap(tokens: Token[]): Map<string, SectionInfo> {
	const sectionMap = new Map<string, SectionInfo>();

	// stack: 每个元素是 [sectionName, openingIdx]
	// 模拟 XML 标签栈，遇到 [/xxx] 就 pop 并判断 pop 出来的 opening 是不是 container
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) break;

		if (token.type === 5 && token.strValue) {
			const name = token.strValue;

			if (isClosingSection(name)) {
				const cleanName = getSectionName(name);
				const info = sectionMap.get(cleanName);
				// 判断 children 范围内有没有其他 opening section
				if (info && !info.isContainer) {
					// 从 stack 栈顶向下找当前 closing 对应的 opening
					// children 在 [info.idx+1, i) 范围内
					for (let j = info.idx + 1; j < i; j++) {
						const t = tokens[j];
						if (!t) break;
						if (t.type === 5 && t.strValue) {
							const n = t.strValue;
							if (!isClosingSection(n)) {
								info.isContainer = true;
								break;
							}
						}
					}
				}
			} else {
				const cleanName = getSectionName(name);
				if (!sectionMap.has(cleanName)) {
					sectionMap.set(cleanName, { isContainer: false, idx: i });
				}
			}
		}
	}

	return sectionMap;
}

function parseSections(
	tokens: Token[],
	ctx: PvfStringContext,
	sectionMap: Map<string, { isContainer: boolean; idx: number }>,
	closingMap: Map<string, number>,
	startIdx: number,
	resolveStringLink: boolean,
): unknown[] {
	const result: unknown[] = [];
	let i = startIdx;

	while (i < tokens.length) {
		const token = tokens[i];
		if (!token) {
			i++;
			continue;
		}

		if (token.type === 5 && token.strValue) {
			const name = token.strValue;

			if (isClosingSection(name)) {
				i++;
				continue;
			}

			const cleanName = getSectionName(name);
			const sectionInfo = sectionMap.get(cleanName);

			if (sectionInfo?.isContainer) {
				const { items, consumed } = parseContainerSection(
					tokens,
					i + 1,
					ctx,
					sectionMap,
					closingMap,
					cleanName,
					resolveStringLink,
				);
				const value = items.length > 0 ? items : null;
				result.push({ [normalizeKey(cleanName)]: value });
				i = consumed;
			} else {
				const { values, consumed } = parseLeafSection(
					tokens,
					i + 1,
					ctx,
					sectionMap,
					resolveStringLink,
				);
				const obj: { [key: string]: unknown } = {};
				obj[normalizeKey(cleanName)] = values.length > 0 ? values : null;
				result.push(obj);
				i = consumed;
			}
		} else {
			i++;
		}
	}

	return result;
}

function parseContainerSection(
	tokens: Token[],
	start: number,
	ctx: PvfStringContext,
	sectionMap: Map<string, { isContainer: boolean; idx: number }>,
	closingMap: Map<string, number>,
	containerName: string,
	resolveStringLink: boolean,
): { items: unknown[]; consumed: number } {
	const items: unknown[] = [];
	let i = start;

	while (i < tokens.length) {
		const token = tokens[i];
		if (!token) {
			i++;
			continue;
		}

		if (token.type === 5 && token.strValue) {
			const name = token.strValue;

			if (isClosingSection(name) && getSectionName(name) === containerName) {
				i++;
				break;
			}

			if (isClosingSection(name)) {
				break;
			}

			const cleanName = getSectionName(name);
			const sectionInfo = sectionMap.get(cleanName);

			if (sectionInfo?.isContainer) {
				const { items: childItems, consumed } = parseContainerSection(
					tokens,
					i + 1,
					ctx,
					sectionMap,
					closingMap,
					cleanName,
					resolveStringLink,
				);
				const value = childItems.length > 0 ? childItems : null;
				items.push({ [normalizeKey(cleanName)]: value });
				i = consumed;
			} else {
				const { values, consumed } = parseLeafSection(
					tokens,
					i + 1,
					ctx,
					sectionMap,
					resolveStringLink,
				);
				const obj: { [key: string]: unknown } = {};
				obj[normalizeKey(cleanName)] = values.length > 0 ? values : null;
				items.push(obj);
				i = consumed;
			}
		} else {
			const val = tokenToValue(token, ctx, i, tokens, resolveStringLink);
			if (val !== undefined) {
				items.push(val);
			}
			i++;
		}
	}

	return { items, consumed: i };
}

function parseLeafSection(
	tokens: Token[],
	start: number,
	ctx: PvfStringContext,
	sectionMap: Map<string, { isContainer: boolean; idx: number }>,
	resolveStringLink: boolean,
): { values: unknown[]; consumed: number } {
	const values: unknown[] = [];
	let i = start;

	while (i < tokens.length) {
		const token = tokens[i];
		if (!token) {
			i++;
			continue;
		}

		if (token.type === 5 && token.strValue) {
			const name = token.strValue;

			if (isClosingSection(name)) {
				const name2 = getSectionName(name);
				const sectionInfo = sectionMap.get(name2);
				if (sectionInfo?.isContainer) {
					break;
				}
				i++;
				continue;
			}

			break;
		}

		const val = tokenToValue(token, ctx, i, tokens, resolveStringLink);
		if (val !== undefined) {
			values.push(val);
		}
		i++;
	}

	return { values, consumed: i };
}

function tokenToValue(
	token: Token,
	ctx: PvfStringContext,
	index: number,
	tokens: Token[],
	resolveStringLink: boolean,
): unknown {
	switch (token.type) {
		case 2:
		case 3:
			return token.value;

		case 4:
			return token.floatValue !== undefined
				? formatFloat(token.floatValue)
				: token.value;

		case 6:
		case 7:
			return token.strValue || "";

		case 9: {
			return undefined; // StringLinkIndex is handled by the next type 10 token
		}

		case 10: {
			// If previous token was type 9 (StringLinkIndex), combine them
			const prevToken = index > 0 ? tokens[index - 1] : null;
			const listId = prevToken?.type === 9 ? prevToken.listId : 0;
			const keyName = ctx.binMap[token.value] || "";

			// 尝试解析实际翻译
			if (resolveStringLink && ctx.translationsByListId && listId > 0) {
				const translations = ctx.translationsByListId.get(listId);
				if (translations?.has(keyName)) {
					return translations.get(keyName)!;
				}
			}

			return `@${listId}::${keyName}`;
		}

		case 8:
			return undefined;

		default:
			return undefined;
	}
}
