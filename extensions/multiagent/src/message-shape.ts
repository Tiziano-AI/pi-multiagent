/** Parses Pi assistant message payloads from JSON-mode events. */

import { isRecord, type AgentMessageLike, type ContentBlock, type UsageStats } from "./types.ts";

export function readMessage(value: unknown): AgentMessageLike | undefined {
	if (!isRecord(value) || value.role !== "assistant" || !Array.isArray(value.content) || typeof value.api !== "string" || typeof value.provider !== "string" || typeof value.model !== "string" || !isNumber(value.timestamp)) return undefined;
	if (value.errorMessage !== undefined && typeof value.errorMessage !== "string") return undefined;
	if (value.responseModel !== undefined && typeof value.responseModel !== "string") return undefined;
	if (value.responseId !== undefined && typeof value.responseId !== "string") return undefined;
	const content = readContent(value.content);
	const usage = readUsage(value.usage);
	if (!content || !usage) return undefined;
	return {
		role: value.role,
		content,
		usage,
		model: value.model,
		stopReason: typeof value.stopReason === "string" ? value.stopReason : undefined,
		errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : undefined,
	};
}

export function addUsage(target: UsageStats, update: UsageStats | undefined): void {
	if (!update) return;
	target.input += update.input;
	target.output += update.output;
	target.cacheRead += update.cacheRead;
	target.cacheWrite += update.cacheWrite;
	target.cost += update.cost;
	target.contextTokens = Math.max(target.contextTokens, update.contextTokens);
}

export function getText(content: ContentBlock[]): string {
	return content
		.filter((item): item is Extract<ContentBlock, { type: "text" }> => item.type === "text")
		.map((item) => item.text)
		.join("\n\n");
}

function readContent(value: unknown[]): ContentBlock[] | undefined {
	const content: ContentBlock[] = [];
	for (const item of value) {
		if (!isRecord(item) || typeof item.type !== "string") return undefined;
		if (item.type === "text") {
			if (typeof item.text !== "string" || (item.textSignature !== undefined && typeof item.textSignature !== "string")) return undefined;
			content.push({ type: "text", text: item.text });
			continue;
		}
		if (item.type === "thinking") {
			if (typeof item.thinking !== "string" || (item.thinkingSignature !== undefined && typeof item.thinkingSignature !== "string") || (item.redacted !== undefined && typeof item.redacted !== "boolean")) return undefined;
			continue;
		}
		if (item.type === "toolCall") {
			if (typeof item.id !== "string" || typeof item.name !== "string" || !isRecord(item.arguments) || (item.thoughtSignature !== undefined && typeof item.thoughtSignature !== "string")) return undefined;
			content.push({ type: "toolCall", name: item.name, arguments: item.arguments });
			continue;
		}
		return undefined;
	}
	return content;
}

function readUsage(value: unknown): UsageStats | undefined {
	if (!isRecord(value) || !isNumber(value.input) || !isNumber(value.output) || !isNumber(value.cacheRead) || !isNumber(value.cacheWrite) || !isNumber(value.totalTokens) || !isUsageCost(value.cost)) return undefined;
	return {
		input: value.input,
		output: value.output,
		cacheRead: value.cacheRead,
		cacheWrite: value.cacheWrite,
		cost: value.cost.total,
		contextTokens: value.totalTokens,
		turns: 0,
	};
}

function isUsageCost(value: unknown): value is { total: number } {
	return isRecord(value) && isNumber(value.input) && isNumber(value.output) && isNumber(value.cacheRead) && isNumber(value.cacheWrite) && isNumber(value.total);
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
