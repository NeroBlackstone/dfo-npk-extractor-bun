import type { PvfStringContext } from "../types";

interface Token {
	type: number;
	data: number;
}

function tokenize(data: Buffer): Token[] {
	const tokens: Token[] = [];
	for (let i = 2; i <= data.length - 5; i += 5) {
		const type = data[i] as number;
		tokens.push({
			type,
			data: data.readInt32LE(i + 1),
		});
	}
	return tokens;
}

function preScanContainerNames(
	tokens: Token[],
	ctx: PvfStringContext,
): Set<string> {
	const names = new Set<string>();
	for (const token of tokens) {
		if (token.type === 5) {
			const name = ctx.binMap[token.data] || "";
			if (name.startsWith("[/") && name.endsWith("]")) {
				names.add(name.slice(2, -1));
			}
		}
	}
	return names;
}

function parseLeafValue(
	token: Token,
	nextToken: Token | undefined,
	ctx: PvfStringContext,
): unknown {
	switch (token.type) {
		case 2:
			return token.data;
		case 3:
			return token.data;
		case 4: {
			const buf = Buffer.alloc(4);
			buf.writeInt32LE(token.data, 0);
			return buf.readFloatLE(0);
		}
		case 6: {
			const str = ctx.binMap[token.data] || "";
			return str;
		}
		case 7: {
			const str = ctx.binMap[token.data] || "";
			return str;
		}
		case 9: {
			if (nextToken && nextToken.type === 10) {
				const listId = token.data;
				const name = ctx.binMap[nextToken.data] || "";
				return `@${listId}::${name}`;
			}
			return null;
		}
		default:
			return null;
	}
}

function findNextSection(
	tokens: Token[],
	start: number,
	end: number,
): number {
	for (let i = start; i < end; i++) {
		const token = tokens[i] as Token;
		if (token.type === 5) {
			return i;
		}
	}
	return end;
}

function parseBody(
	tokens: Token[],
	start: number,
	end: number,
	containerNames: Set<string>,
	ctx: PvfStringContext,
): Array<Record<string, unknown>> {
	const nodes: Array<Record<string, unknown>> = [];
	let i = start;

	while (i < end) {
		const token = tokens[i] as Token;

		if (token.type === 5) {
			const rawName = ctx.binMap[token.data] || "";
			// Extract section name: remove [/ ... ] wrapper
			const sectionName = rawName
				.replace(/^\[/, "")
				.replace(/\]$/, "")
				.replace(/ /g, "_");

			const isContainer = containerNames.has(
				rawName.startsWith("[/") && rawName.endsWith("]")
					? rawName.slice(2, -1)
					: sectionName,
			);

			if (isContainer) {
				// Find close tag
				let closeIdx = i + 1;
				while (closeIdx < end) {
					const t = tokens[closeIdx] as Token;
					if (t.type === 5) {
						const n = ctx.binMap[t.data] || "";
						if (n === `[/${sectionName}]` || n === rawName.replace(/^\[/, "[/")) {
							break;
						}
					}
					closeIdx++;
				}

				const children = parseBody(
					tokens,
					i + 1,
					closeIdx,
					containerNames,
					ctx,
				);

				// Check for duplicate keys — if any key appears multiple times,
				// each child becomes a separate array element
				const keyCount = new Map<string, number>();
				for (const child of children) {
					for (const key of Object.keys(child)) {
						keyCount.set(key, (keyCount.get(key) || 0) + 1);
					}
				}
				const hasDuplicateKeys = [...keyCount.values()].some((c) => c > 1);

				if (hasDuplicateKeys) {
					// Each child with duplicate keys becomes separate array element
					const arr: unknown[] = [];
					for (const child of children) {
						for (const [key, value] of Object.entries(child)) {
							if (key !== "_value") {
								arr.push({ [key]: value });
							}
						}
					}
					nodes.push({ [sectionName]: arr });
				} else {
					// All unique keys: merge into one object
					const obj: Record<string, unknown> = {};
					for (const child of children) {
						for (const [key, value] of Object.entries(child)) {
							if (key !== "_value") {
								obj[key] = value;
							}
						}
					}
					nodes.push({ [sectionName]: [obj] });
				}
				i = closeIdx + 1; // skip close tag
			} else {
				// Leaf section
				const sectionEnd = findNextSection(tokens, i + 1, end);
				const children = parseBody(
					tokens,
					i + 1,
					sectionEnd,
					containerNames,
					ctx,
				);

				if (children.length === 1) {
					const child = children[0] as Record<string, unknown>;
					const keys = Object.keys(child);
					if (keys.length === 1) {
						nodes.push({ [sectionName]: child[keys[0] as string] });
					} else {
						nodes.push({ [sectionName]: child });
					}
				} else if (children.length === 0) {
					nodes.push({ [sectionName]: null });
				} else {
					// Flatten: if all children have the same single key pattern,
					// extract values into array
					const values: unknown[] = [];
					for (const child of children) {
						const keys = Object.keys(child);
						if (keys.length === 1) {
							values.push(child[keys[0] as string]);
						} else {
							values.push(child);
						}
					}
					// Single value simplification
					if (values.length === 1) {
						nodes.push({ [sectionName]: values[0] });
					} else {
						nodes.push({ [sectionName]: values });
					}
				}

				i = sectionEnd;
			}
		} else if (token.type === 8) {
			// CommandSeparator: discard
			i++;
		} else {
			// Non-section token at body level (e.g. direct values in container)
			const nextToken = i + 1 < end ? (tokens[i + 1] as Token) : undefined;
			if (token.type === 9 && nextToken && nextToken.type === 10) {
				// StringLink pair
				const listId = token.data;
				const name = ctx.binMap[nextToken.data] || "";
				// Find the enclosing section name from recent context
				// These appear as inline values in a section
				nodes.push({ _value: `@${listId}::${name}` });
				i += 2;
			} else {
				const val = parseLeafValue(token, nextToken, ctx);
				if (val !== null) {
					nodes.push({ _value: val });
				}
				i++;
			}
		}
	}

	return nodes;
}

/**
 * Parse ScriptFile binary token stream to JSON object.
 *
 * Algorithm (from docs/scriptfile-json-spec.md):
 * 1. Flatten 5-byte tokens from offset 2
 * 2. Pre-scan type 5 tokens to identify containers ([/name] close tags)
 * 3. Recursively build tree
 * 4. Merge type 9+10 StringLink pairs
 */
export function parseScriptFileToJson(
	data: Buffer,
	ctx: PvfStringContext,
): unknown[] {
	if (data.length < 7) {
		return [];
	}

	const tokens = tokenize(data);
	const containerNames = preScanContainerNames(tokens, ctx);

	const children = parseBody(tokens, 0, tokens.length, containerNames, ctx);

	// Top level: wrap in array per spec
	const result: unknown[] = [];
	for (const child of children) {
		for (const [key, value] of Object.entries(child)) {
			if (key === "_value") {
				// Bare value at top level — skip or merge into array
				continue;
			}
			result.push({ [key]: value });
		}
	}

	return result;
}
