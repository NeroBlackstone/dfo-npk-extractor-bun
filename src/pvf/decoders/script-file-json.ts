import type { PvfStringContext } from "../types";

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
): unknown[] {
	if (data.length < 7) {
		return [];
	}

	const tokens = parseTokens(data, ctx);
	const closingMap = buildClosingMap(tokens);
	const sectionMap = buildSectionMap(tokens, closingMap);

	const result = parseSections(tokens, ctx, sectionMap, closingMap, 0);
	return result;
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

function buildSectionMap(
	tokens: Token[],
	closingMap: Map<string, number>,
): Map<string, { isContainer: boolean; idx: number }> {
	const sectionMap = new Map<string, { isContainer: boolean; idx: number }>();

	// First pass: record all opening section tokens
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) break;
		if (token.type === 5 && token.strValue) {
			const name = token.strValue;
			if (!isClosingSection(name)) {
				const cleanName = getSectionName(name);
				if (!sectionMap.has(cleanName)) {
					sectionMap.set(cleanName, { isContainer: false, idx: i });
				}
			}
		}
	}

	// Second pass: determine which are containers
	for (const [name, info] of sectionMap) {
		const closingIdx = closingMap.get(name);
		if (closingIdx !== undefined) {
			for (let i = info.idx + 1; i < closingIdx; i++) {
				const token = tokens[i];
				if (!token) break;
				if (token.type === 5 && token.strValue) {
					const n = token.strValue;
					if (!isClosingSection(n)) {
						info.isContainer = true;
						break;
					}
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
					closingMap,
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
					closingMap,
				);
				const obj: { [key: string]: unknown } = {};
				obj[normalizeKey(cleanName)] = values.length > 0 ? values : null;
				items.push(obj);
				i = consumed;
			}
		} else if (token.type !== 8) {
			const val = tokenToValue(token, ctx, i, tokens);
			if (val !== undefined) {
				items.push(val);
			}
			i++;
		} else {
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
	_closingMap: Map<string, number>,
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

		const val = tokenToValue(token, ctx, i, tokens);
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
			return `@${listId}::${keyName}`;
		}

		case 8:
			return undefined;

		default:
			return undefined;
	}
}
