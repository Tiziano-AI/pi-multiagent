/** Validates documented Pi lifecycle frames that may trail terminal assistant output. */

import { isRecord } from "./types.ts";

export interface PostTerminalLifecycleState {
	sawTurnEnd: boolean;
	sawAgentEnd: boolean;
	compactionOpen: boolean;
}

export interface PostTerminalLifecycleDecision {
	accepted: boolean;
	errorMessage: string | undefined;
}

export function createPostTerminalLifecycleState(): PostTerminalLifecycleState {
	return { sawTurnEnd: false, sawAgentEnd: false, compactionOpen: false };
}

export function finishPostTerminalLifecycleState(state: PostTerminalLifecycleState): string | undefined {
	if (state.sawTurnEnd && !state.sawAgentEnd) return "Subagent emitted invalid post-terminal lifecycle event: agent_end missing after turn_end.";
	// Pi JSON print mode may close after post-agent auto-compaction starts but before its async end event is emitted.
	return undefined;
}

export function classifyPostTerminalLifecycle(record: Record<string, unknown>, state: PostTerminalLifecycleState): PostTerminalLifecycleDecision {
	if (record.type === "auto_retry_end") return classifyPostTerminalAutoRetryEnd(record, state);
	if (record.type === "compaction_start") return classifyPostTerminalCompactionStart(record, state);
	if (record.type === "compaction_end") return classifyPostTerminalCompactionEnd(record, state);
	if (record.type === "turn_end") return classifyPostTerminalTurnEnd(record, state);
	if (record.type === "agent_end") return classifyPostTerminalAgentEnd(record, state);
	return { accepted: false, errorMessage: undefined };
}

function classifyPostTerminalAutoRetryEnd(record: Record<string, unknown>, state: PostTerminalLifecycleState): PostTerminalLifecycleDecision {
	if (state.sawAgentEnd) return rejectedPostTerminalLifecycle("auto_retry_end after agent_end");
	if (record.success !== true) return rejectedPostTerminalLifecycle("auto_retry_end did not report success");
	if (!isNumber(record.attempt)) return rejectedPostTerminalLifecycle("auto_retry_end attempt is malformed");
	if (record.finalError !== undefined && typeof record.finalError !== "string") return rejectedPostTerminalLifecycle("auto_retry_end finalError is malformed");
	return { accepted: true, errorMessage: undefined };
}

function classifyPostTerminalCompactionStart(record: Record<string, unknown>, state: PostTerminalLifecycleState): PostTerminalLifecycleDecision {
	if (!state.sawAgentEnd) return rejectedPostTerminalLifecycle("compaction_start before agent_end");
	if (!isCompactionReason(record.reason)) return rejectedPostTerminalLifecycle("compaction_start missing reason");
	if (state.compactionOpen) return rejectedPostTerminalLifecycle("duplicate compaction_start");
	state.compactionOpen = true;
	return { accepted: true, errorMessage: undefined };
}

function classifyPostTerminalCompactionEnd(record: Record<string, unknown>, state: PostTerminalLifecycleState): PostTerminalLifecycleDecision {
	if (!state.compactionOpen) return rejectedPostTerminalLifecycle("compaction_end before compaction_start");
	if (!isCompactionReason(record.reason)) return rejectedPostTerminalLifecycle("compaction_end missing reason");
	if (record.result !== undefined && !isRecord(record.result)) return rejectedPostTerminalLifecycle("compaction_end result is malformed");
	if (typeof record.aborted !== "boolean") return rejectedPostTerminalLifecycle("compaction_end aborted flag is malformed");
	if (typeof record.willRetry !== "boolean") return rejectedPostTerminalLifecycle("compaction_end retry flag is malformed");
	if (record.errorMessage !== undefined && typeof record.errorMessage !== "string") return rejectedPostTerminalLifecycle("compaction_end errorMessage is malformed");
	if (record.aborted) return rejectedPostTerminalLifecycle("compaction_end reported abort");
	if (record.errorMessage !== undefined) return rejectedPostTerminalLifecycle("compaction_end reported error");
	if (record.willRetry) return rejectedPostTerminalLifecycle("compaction_end requested retry after terminal stop");
	state.compactionOpen = false;
	return { accepted: true, errorMessage: undefined };
}

function classifyPostTerminalTurnEnd(record: Record<string, unknown>, state: PostTerminalLifecycleState): PostTerminalLifecycleDecision {
	if (state.sawAgentEnd) return rejectedPostTerminalLifecycle("turn_end after agent_end");
	if (state.sawTurnEnd) return rejectedPostTerminalLifecycle("duplicate turn_end");
	const message = record.message;
	if (!isRecord(message)) return rejectedPostTerminalLifecycle("turn_end missing assistant message");
	if (message.role !== "assistant") return rejectedPostTerminalLifecycle("turn_end message is not assistant role");
	if (!isMessageContentShape(message.content)) return rejectedPostTerminalLifecycle("turn_end message content is malformed");
	if (message.stopReason !== "stop") return rejectedPostTerminalLifecycle("turn_end stopReason is not stop");
	if (message.errorMessage !== undefined) return rejectedPostTerminalLifecycle("turn_end message includes errorMessage");
	if (!isAssistantMessageShape(message)) return rejectedPostTerminalLifecycle("turn_end assistant message metadata is malformed");
	const toolResults = record.toolResults;
	if (!Array.isArray(toolResults)) return rejectedPostTerminalLifecycle("turn_end missing toolResults array");
	if (toolResults.length !== 0) return rejectedPostTerminalLifecycle("turn_end has post-terminal tool results");
	state.sawTurnEnd = true;
	return { accepted: true, errorMessage: undefined };
}

function classifyPostTerminalAgentEnd(record: Record<string, unknown>, state: PostTerminalLifecycleState): PostTerminalLifecycleDecision {
	if (state.sawAgentEnd) return rejectedPostTerminalLifecycle("duplicate agent_end");
	if (!state.sawTurnEnd) return rejectedPostTerminalLifecycle("agent_end before turn_end");
	const messages = record.messages;
	if (!Array.isArray(messages)) return rejectedPostTerminalLifecycle("agent_end missing messages array");
	if (!messages.every(isAgentMessageShape)) return rejectedPostTerminalLifecycle("agent_end messages are malformed");
	state.sawAgentEnd = true;
	return { accepted: true, errorMessage: undefined };
}

export function isAgentMessageShape(value: unknown): boolean {
	if (!isRecord(value) || typeof value.role !== "string") return false;
	const role = value.role;
	if (role === "assistant") return isAssistantMessageShape(value);
	if (role === "toolResult") return typeof value.toolCallId === "string" && typeof value.toolName === "string" && isTextImageContentShape(value.content) && typeof value.isError === "boolean" && hasTimestamp(value);
	if (role === "user") return isTextImageContentOrString(value.content) && hasTimestamp(value);
	if (role === "custom") return typeof value.customType === "string" && isTextImageContentOrString(value.content) && typeof value.display === "boolean" && hasTimestamp(value);
	if (role === "bashExecution") return typeof value.command === "string" && typeof value.output === "string" && (value.exitCode === undefined || isNumber(value.exitCode)) && typeof value.cancelled === "boolean" && typeof value.truncated === "boolean" && hasTimestamp(value) && (value.fullOutputPath === undefined || typeof value.fullOutputPath === "string") && (value.excludeFromContext === undefined || typeof value.excludeFromContext === "boolean");
	if (role === "branchSummary") return typeof value.summary === "string" && typeof value.fromId === "string" && hasTimestamp(value);
	return role === "compactionSummary" && typeof value.summary === "string" && isNumber(value.tokensBefore) && hasTimestamp(value);
}

function isAssistantMessageShape(value: Record<string, unknown>): boolean {
	return isMessageContentShape(value.content) && isUsageShape(value.usage) && typeof value.api === "string" && typeof value.provider === "string" && typeof value.model === "string" && typeof value.stopReason === "string" && hasTimestamp(value) && (value.errorMessage === undefined || typeof value.errorMessage === "string") && (value.responseModel === undefined || typeof value.responseModel === "string") && (value.responseId === undefined || typeof value.responseId === "string");
}

function isUsageShape(value: unknown): boolean {
	return isRecord(value) && isNumber(value.input) && isNumber(value.output) && isNumber(value.cacheRead) && isNumber(value.cacheWrite) && isNumber(value.totalTokens) && isRecord(value.cost) && isNumber(value.cost.input) && isNumber(value.cost.output) && isNumber(value.cost.cacheRead) && isNumber(value.cost.cacheWrite) && isNumber(value.cost.total);
}

function hasTimestamp(value: Record<string, unknown>): boolean {
	return isNumber(value.timestamp);
}

function isTextImageContentOrString(value: unknown): boolean {
	return typeof value === "string" || isTextImageContentShape(value);
}

function isMessageContentShape(value: unknown): boolean {
	return Array.isArray(value) && value.every(isAssistantContentBlockShape);
}

function isTextImageContentShape(value: unknown): boolean {
	return Array.isArray(value) && value.every(isTextImageBlockShape);
}

function isAssistantContentBlockShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	if (value.type === "text") return typeof value.text === "string" && (value.textSignature === undefined || typeof value.textSignature === "string");
	if (value.type === "thinking") return typeof value.thinking === "string" && (value.thinkingSignature === undefined || typeof value.thinkingSignature === "string") && (value.redacted === undefined || typeof value.redacted === "boolean");
	if (value.type === "toolCall") return typeof value.id === "string" && typeof value.name === "string" && isRecord(value.arguments) && (value.thoughtSignature === undefined || typeof value.thoughtSignature === "string");
	return false;
}

function isTextImageBlockShape(value: unknown): boolean {
	if (!isRecord(value)) return false;
	if (value.type === "image") return typeof value.data === "string" && typeof value.mimeType === "string";
	return value.type === "text" && typeof value.text === "string";
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isCompactionReason(value: unknown): boolean {
	return value === "manual" || value === "threshold" || value === "overflow";
}

function rejectedPostTerminalLifecycle(reason: string): PostTerminalLifecycleDecision {
	return { accepted: false, errorMessage: `Subagent emitted invalid post-terminal lifecycle event: ${reason}.` };
}
