/** Conservative JSON object prefix classification for child stdout buffers. */

import { trimStartJsonWhitespace } from "./json-whitespace.ts";

type JsonPrefixStatus = "complete" | "incomplete" | "malformed";
type ObjectState = "keyOrEnd" | "key" | "colon" | "value" | "commaOrEnd";
type ArrayState = "valueOrEnd" | "value" | "commaOrEnd";
type Context = { kind: "object"; state: ObjectState } | { kind: "array"; state: ArrayState };

interface TokenResult {
	status: JsonPrefixStatus;
	index: number;
}

export function hasDefinitelyMalformedJsonObjectPrefix(input: string): boolean {
	const source = trimStartJsonWhitespace(input);
	if (!source.startsWith("{")) return false;
	return classifyJsonObjectPrefix(source) === "malformed";
}

function classifyJsonObjectPrefix(source: string): JsonPrefixStatus {
	const contexts: Context[] = [{ kind: "object", state: "keyOrEnd" }];
	let index = 1;
	while (true) {
		index = skipWhitespace(source, index);
		const context = contexts[contexts.length - 1];
		if (!context) return index === source.length ? "complete" : "malformed";
		if (index >= source.length) return "incomplete";
		const char = source[index];
		if (context.kind === "object") {
			if (context.state === "keyOrEnd" || context.state === "key") {
				if (char === "}" && context.state === "keyOrEnd") {
					const closed = closeContext(contexts, source, index + 1);
					if (closed.status !== "incomplete") return closed.status;
					index = closed.index;
					continue;
				}
				if (char !== '"') return "malformed";
				const key = consumeString(source, index);
				if (key.status !== "complete") return key.status;
				context.state = "colon";
				index = key.index;
				continue;
			}
			if (context.state === "colon") {
				if (char !== ":") return "malformed";
				context.state = "value";
				index++;
				continue;
			}
			if (context.state === "value") {
				const value = consumeValue(source, index, contexts);
				if (value.status !== "complete") return value.status;
				context.state = "commaOrEnd";
				index = value.index;
				continue;
			}
			if (char === ",") {
				context.state = "key";
				index++;
				continue;
			}
			if (char === "}") {
				const closed = closeContext(contexts, source, index + 1);
				if (closed.status !== "incomplete") return closed.status;
				index = closed.index;
				continue;
			}
			return "malformed";
		}
		if (context.state === "valueOrEnd" && char === "]") {
			const closed = closeContext(contexts, source, index + 1);
			if (closed.status !== "incomplete") return closed.status;
			index = closed.index;
			continue;
		}
		if (context.state === "valueOrEnd" || context.state === "value") {
			const value = consumeValue(source, index, contexts);
			if (value.status !== "complete") return value.status;
			context.state = "commaOrEnd";
			index = value.index;
			continue;
		}
		if (char === ",") {
			context.state = "value";
			index++;
			continue;
		}
		if (char === "]") {
			const closed = closeContext(contexts, source, index + 1);
			if (closed.status !== "incomplete") return closed.status;
			index = closed.index;
			continue;
		}
		return "malformed";
	}
}

function closeContext(contexts: Context[], source: string, index: number): TokenResult {
	contexts.pop();
	if (contexts.length > 0) return { status: "incomplete", index };
	const next = skipWhitespace(source, index);
	return { status: next === source.length ? "complete" : "malformed", index: next };
}

function consumeValue(source: string, index: number, contexts: Context[]): TokenResult {
	const char = source[index];
	if (char === '"') return consumeString(source, index);
	if (char === "{") {
		contexts.push({ kind: "object", state: "keyOrEnd" });
		return { status: "complete", index: index + 1 };
	}
	if (char === "[") {
		contexts.push({ kind: "array", state: "valueOrEnd" });
		return { status: "complete", index: index + 1 };
	}
	if (char === "t") return consumeLiteral(source, index, "true");
	if (char === "f") return consumeLiteral(source, index, "false");
	if (char === "n") return consumeLiteral(source, index, "null");
	if (char === "-" || isDigit(char)) return consumeNumber(source, index);
	return { status: "malformed", index };
}

function consumeString(source: string, index: number): TokenResult {
	let cursor = index + 1;
	while (cursor < source.length) {
		const char = source[cursor];
		if (char === '"') return { status: "complete", index: cursor + 1 };
		if (char === "\\") {
			cursor++;
			if (cursor >= source.length) return { status: "incomplete", index: cursor };
			const escaped = source[cursor];
			if (escaped === "u") {
				for (let offset = 1; offset <= 4; offset++) {
					const hex = source[cursor + offset];
					if (hex === undefined) return { status: "incomplete", index: cursor + offset };
					if (!isHex(hex)) return { status: "malformed", index: cursor + offset };
				}
				cursor += 5;
				continue;
			}
			if (!isSimpleEscape(escaped)) return { status: "malformed", index: cursor };
			cursor++;
			continue;
		}
		if (source.charCodeAt(cursor) <= 0x1f) return { status: "malformed", index: cursor };
		cursor++;
	}
	return { status: "incomplete", index: cursor };
}

function consumeLiteral(source: string, index: number, literal: "true" | "false" | "null"): TokenResult {
	for (let offset = 0; offset < literal.length; offset++) {
		const char = source[index + offset];
		if (char === undefined) return { status: "incomplete", index: index + offset };
		if (char !== literal[offset]) return { status: "malformed", index: index + offset };
	}
	return { status: "complete", index: index + literal.length };
}

function consumeNumber(source: string, index: number): TokenResult {
	let cursor = index;
	if (source[cursor] === "-") {
		cursor++;
		if (cursor >= source.length) return { status: "incomplete", index: cursor };
	}
	if (source[cursor] === "0") cursor++;
	else if (isDigitOneToNine(source[cursor])) {
		cursor++;
		while (isDigit(source[cursor])) cursor++;
	} else return { status: "malformed", index: cursor };
	if (source[cursor] === ".") {
		cursor++;
		if (cursor >= source.length) return { status: "incomplete", index: cursor };
		if (!isDigit(source[cursor])) return { status: "malformed", index: cursor };
		while (isDigit(source[cursor])) cursor++;
	}
	if (source[cursor] === "e" || source[cursor] === "E") {
		cursor++;
		if (cursor >= source.length) return { status: "incomplete", index: cursor };
		if (source[cursor] === "+" || source[cursor] === "-") {
			cursor++;
			if (cursor >= source.length) return { status: "incomplete", index: cursor };
		}
		if (!isDigit(source[cursor])) return { status: "malformed", index: cursor };
		while (isDigit(source[cursor])) cursor++;
	}
	return { status: "complete", index: cursor };
}

function skipWhitespace(source: string, index: number): number {
	let cursor = index;
	while (source[cursor] === " " || source[cursor] === "\t" || source[cursor] === "\r" || source[cursor] === "\n") cursor++;
	return cursor;
}

function isSimpleEscape(char: string): boolean {
	return char === '"' || char === "\\" || char === "/" || char === "b" || char === "f" || char === "n" || char === "r" || char === "t";
}

function isDigit(char: string | undefined): boolean {
	return char !== undefined && char >= "0" && char <= "9";
}

function isDigitOneToNine(char: string | undefined): boolean {
	return char !== undefined && char >= "1" && char <= "9";
}

function isHex(char: string): boolean {
	return (char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F");
}
