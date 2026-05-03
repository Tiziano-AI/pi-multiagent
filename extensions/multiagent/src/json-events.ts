/** JSON-mode event parsing for child Pi subprocesses. */

import {
	EVENT_PREVIEW_CHARS,
	EVENT_PREVIEW_COUNT,
	STDERR_PREVIEW_CHARS,
	createEmptyUsage,
	isRecord,
	type AgentRunResult,
	type AgentSource,
	type AgentStatus,
	type FailureProvenance,
	type TeamEvent,
} from "./types.ts";
import { appendAssistantOutput, createStepAssistantOutput, setAssistantOutput } from "./assistant-output.ts";
import { formatFailureProvenance } from "./failure-provenance.ts";
import { addUsage, getText, readMessage } from "./message-shape.ts";
import { isAgentMessageShape } from "./post-terminal-lifecycle.ts";
import { trimJsonWhitespace } from "./json-whitespace.ts";

interface RunCompletionState {
	aborted: boolean;
	timedOut: boolean;
	exitSignal?: string;
	failureTerminated?: boolean;
	launched?: boolean;
	closeout?: string;
}

interface ApplyJsonEventOptions {
	postTerminalLifecycleAccepted?: boolean;
}

export function createRunResult(input: {
	id: string;
	agent: string;
	agentName: string;
	agentRef: string;
	agentSource: AgentSource;
	task: string;
	cwd: string;
	needs?: string[];
	status?: AgentStatus;
	synthesis?: boolean;
}): AgentRunResult {
	return {
		id: input.id,
		agent: input.agent,
		agentName: input.agentName,
		agentRef: input.agentRef,
		agentSource: input.agentSource,
		task: input.task,
		cwd: input.cwd,
		needs: input.needs ?? [],
		status: input.status ?? "running",
		exitCode: undefined,
		exitSignal: undefined,
		assistantOutput: createStepAssistantOutput(),
		stderr: "",
		stderrTruncated: false,
		events: [],
		eventsTruncated: false,
		usage: createEmptyUsage(),
		model: undefined,
		stopReason: undefined,
		errorMessage: undefined,
		failureCause: undefined,
		failureProvenance: undefined,
		timedOut: false,
		malformedStdout: false,
		sawAssistantMessageEnd: false,
		protocolTerminal: false,
		lateEventsIgnored: false,
		synthesis: input.synthesis ?? false,
	};
}

export function parseJsonRecordLine(line: string): Record<string, unknown> | undefined {
	const trimmed = trimJsonWhitespace(line);
	if (trimmed.length === 0) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return undefined;
	}
	return isRecord(parsed) ? parsed : undefined;
}

export function applyJsonEvent(result: AgentRunResult, event: Record<string, unknown>, options: ApplyJsonEventOptions = {}): boolean {
	const eventType = typeof event.type === "string" ? event.type : undefined;
	if (result.protocolTerminal && (!options.postTerminalLifecycleAccepted || isUnexpectedPostTerminalEvent(eventType))) return noteLateEvent(result);
	if (eventType === "tool_execution_start") {
		const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
		appendEvent(result, { type: "tool", label: toolName, preview: formatToolPreview(event.args), status: "running" });
		return true;
	}
	if (eventType === "tool_execution_end") {
		const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
		appendEvent(result, {
			type: "tool",
			label: toolName,
			preview: event.isError === true ? "failed" : "done",
			status: event.isError === true ? "error" : "done",
		});
		return true;
	}
	if (eventType === "auto_retry_start") {
		resetTransientAssistantFailure(result);
		return appendLifecycleEvent(result, "auto-retry", `attempt ${readEventNumber(event.attempt)} of ${readEventNumber(event.maxAttempts)}; delay ${readEventNumber(event.delayMs)}ms`, "running");
	}
	if (eventType === "auto_retry_end") return appendLifecycleEvent(result, "auto-retry", event.success === true ? "succeeded" : readEventText(event.finalError, "failed"), event.success === true ? "done" : "error");
	if (eventType === "compaction_start") return appendLifecycleEvent(result, "compaction", `${readEventText(event.reason, "unknown")} started`, "running");
	if (eventType === "compaction_end") {
		const failed = event.aborted === true || event.errorMessage !== undefined;
		const retrying = event.willRetry === true;
		if (result.protocolTerminal && retrying) return noteLateEvent(result);
		if (!failed && retrying) resetTransientAssistantFailure(result);
		if (failed) setErrorMessage(result, "Compaction failed");
		return appendLifecycleEvent(result, "compaction", `${readEventText(event.reason, "unknown")} ended${retrying ? "; will retry" : ""}${event.errorMessage ? `: ${String(event.errorMessage)}` : ""}`, failed ? "error" : "done");
	}
	if (eventType === "message_update") {
		if (result.stopReason === "toolUse") return true;
		const update = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : undefined;
		if (update?.type === "text_delta" && typeof update.delta === "string") {
			const artifactError = appendAssistantOutput(result, update.delta);
			if (artifactError) setErrorMessage(result, artifactError);
			return true;
		}
	}
	if (eventType === "message_end") {
		const raw = event.message;
		if (!isRecord(raw) || typeof raw.role !== "string") return noteMalformedMessageEnd(result);
		if (raw.role !== "assistant") return isAgentMessageShape(raw) ? false : noteMalformedMessageEnd(result);
		const message = readMessage(raw);
		if (!message) return noteMalformedMessageEnd(result);
		result.sawAssistantMessageEnd = true;
		const stopReason = message.stopReason;
		const childError = message.errorMessage;
		if (!stopReason || stopReason === "toolUse") result.assistantOutput = createStepAssistantOutput();
		else if (stopReason === "stop") {
			const artifactError = setAssistantOutput(result, getText(message.content));
			if (artifactError) setErrorMessage(result, artifactError);
		} else if (stopReason && result.assistantOutput.chars === 0) {
			const artifactError = setAssistantOutput(result, getText(message.content));
			if (artifactError) setErrorMessage(result, artifactError);
		}
		addUsage(result.usage, message.usage);
		result.usage.turns += 1;
		result.model = message.model ?? result.model;
		if (!stopReason) {
			result.protocolTerminal = true;
			result.malformedStdout = true;
			if (result.stopReason === "stop" || result.stopReason === "toolUse") result.stopReason = undefined;
			setErrorMessage(result, "Subagent assistant message_end omitted a success stopReason.");
		} else if (childError) {
			setErrorMessage(result, `Subagent assistant error: ${childError}`);
			result.stopReason = stopReason;
			result.protocolTerminal = false;
		} else if (stopReason === "toolUse") result.stopReason = stopReason;
		else if (stopReason === "stop" && !result.errorMessage) {
			result.stopReason = stopReason;
			result.protocolTerminal = true;
		} else {
			result.stopReason = stopReason;
			result.protocolTerminal = true;
			setErrorMessage(result, `Subagent ended with non-success stop reason ${stopReason}.`);
		}
		if (childError) appendDiagnostic(result, `Subagent assistant error reported: ${childError}`);
		return true;
	}
	return false;
}

export function appendStderr(result: AgentRunResult, text: string): void {
	result.stderr += text;
	if (result.stderr.length > STDERR_PREVIEW_CHARS) {
		result.stderr = result.stderr.slice(result.stderr.length - STDERR_PREVIEW_CHARS);
		result.stderrTruncated = true;
	}
}

export function appendDiagnostic(result: AgentRunResult, preview: string): void {
	appendEvent(result, { type: "diagnostic", label: "diagnostic", preview, status: undefined });
}

export function noteFailureCause(result: AgentRunResult, cause: string): void {
	result.failureCause = result.failureCause ?? cause;
}

export function setFailureProvenance(result: AgentRunResult, provenance: FailureProvenance): void {
	result.failureProvenance = provenance;
	appendDiagnostic(result, `Failure provenance: ${formatFailureProvenance(provenance)}`);
}

function setErrorMessage(result: AgentRunResult, message: string): void {
	if (result.errorMessage === undefined) {
		result.errorMessage = message;
		noteFailureCause(result, message);
		return;
	}
	noteFailureCause(result, result.errorMessage);
}

export function markMalformedStdout(result: AgentRunResult, line: string): void {
	result.malformedStdout = true;
	appendDiagnostic(result, `Non-JSON stdout: ${line}`);
}

export function setOutputCapture(result: AgentRunResult, text: string): void {
	const artifactError = setAssistantOutput(result, text);
	if (artifactError) setErrorMessage(result, artifactError);
}

function resetTransientAssistantFailure(result: AgentRunResult): void {
	const preserveToolUseLatch = result.stopReason === "toolUse";
	result.assistantOutput = createStepAssistantOutput();
	result.errorMessage = undefined;
	result.failureCause = undefined;
	result.failureProvenance = undefined;
	result.stopReason = preserveToolUseLatch ? "toolUse" : undefined;
	result.protocolTerminal = false;
	result.sawAssistantMessageEnd = preserveToolUseLatch;
	result.lateEventsIgnored = false;
}

function appendLifecycleEvent(result: AgentRunResult, label: string, preview: string, status: TeamEvent["status"]): boolean {
	appendEvent(result, { type: "diagnostic", label, preview, status });
	return true;
}

function appendEvent(result: AgentRunResult, event: TeamEvent): void {
	const cappedEvent = capEventPreview(event);
	if (result.events.length < EVENT_PREVIEW_COUNT) {
		result.events.push(cappedEvent);
		return;
	}
	result.eventsTruncated = true;
	const marker: TeamEvent = {
		type: "diagnostic",
		label: "events-truncated",
		preview: `Older subagent events were truncated at ${EVENT_PREVIEW_COUNT} retained entries.`,
		status: undefined,
	};
	const retained = result.events[0]?.label === marker.label ? result.events.slice(1) : result.events;
	result.events = [marker, ...retained.slice(-(EVENT_PREVIEW_COUNT - 2)), cappedEvent];
}

function formatToolPreview(value: unknown): string {
	if (value === undefined) return "";
	try {
		return JSON.stringify(value);
	} catch (error) {
		return error instanceof Error ? `[unserializable tool args: ${error.message}]` : "[unserializable tool args]";
	}
}

function capEventPreview(event: TeamEvent): TeamEvent {
	if (event.preview.length <= EVENT_PREVIEW_CHARS) return event;
	const marker = `\n[event preview truncated at ${EVENT_PREVIEW_CHARS} chars]`;
	return { ...event, preview: `${event.preview.slice(0, Math.max(0, EVENT_PREVIEW_CHARS - marker.length))}${marker}` };
}

function isUnexpectedPostTerminalEvent(eventType: string | undefined): boolean {
	return !["turn_end", "agent_end", "auto_retry_end", "compaction_start", "compaction_end"].includes(eventType ?? "");
}

function noteLateEvent(result: AgentRunResult): boolean {
	if (result.lateEventsIgnored) return false;
	result.lateEventsIgnored = true;
	const message = "Subagent emitted JSON event after terminal assistant message_end.";
	setErrorMessage(result, message);
	appendDiagnostic(result, message);
	return true;
}

function noteMalformedMessageEnd(result: AgentRunResult): boolean {
	result.malformedStdout = true;
	result.protocolTerminal = true;
	if (result.stopReason === "stop" || result.stopReason === "toolUse") result.stopReason = undefined;
	setErrorMessage(result, "Subagent emitted malformed assistant message_end event.");
	return true;
}

function readEventText(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readEventNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function finishRunStatus(
	result: AgentRunResult,
	exitCode: number | undefined,
	state: RunCompletionState,
): void {
	const aborted = state.aborted;
	const hasPriorFailure = result.errorMessage !== undefined || result.failureCause !== undefined || result.malformedStdout;
	result.exitCode = exitCode;
	result.exitSignal = state.exitSignal;
	result.timedOut = state.timedOut;
	if (state.timedOut && !hasPriorFailure) {
		noteFailureCause(result, `Subagent exceeded step timeout before completion.`);
		result.status = "timed_out";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	if (aborted && !hasPriorFailure) {
		noteFailureCause(result, state.launched === false ? "Aborted before launch." : "Parent abort requested termination.");
		result.status = "aborted";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	if (state.exitSignal && !hasPriorFailure) {
		setErrorMessage(result, `Subagent process exited by signal ${state.exitSignal}.`);
		result.status = "failed";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	if (exitCode === undefined && !hasPriorFailure) {
		setErrorMessage(result, "Subagent process ended without an exit code.");
		result.status = "failed";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	if (exitCode !== undefined && exitCode !== 0 && !hasPriorFailure) {
		noteFailureCause(result, `Subagent process exited with code ${exitCode}.`);
		result.status = "failed";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	if (result.malformedStdout) {
		setErrorMessage(result, "Subagent emitted non-JSON stdout while running in JSON mode.");
		result.status = "failed";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	if (result.errorMessage) {
		noteFailureCause(result, result.errorMessage);
		result.status = "failed";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	if (!result.sawAssistantMessageEnd) {
		setErrorMessage(result, "Subagent process ended without an assistant message_end event.");
		result.status = "failed";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	if (result.stopReason !== "stop") {
		setErrorMessage(result, result.stopReason ? `Subagent ended with non-success stop reason ${result.stopReason}.` : "Subagent assistant message_end omitted a success stopReason.");
		result.status = "failed";
		recordFailureProvenance(result, exitCode, state);
		return;
	}
	result.status = "succeeded";
}

function recordFailureProvenance(result: AgentRunResult, exitCode: number | undefined, state: RunCompletionState): void {
	const failureTerminated = state.failureTerminated === true;
	setFailureProvenance(result, {
		likelyRoot: inferLikelyFailureRoot(result, exitCode, state),
		status: result.status,
		exitCode,
		exitSignal: state.exitSignal,
		timedOut: state.timedOut,
		aborted: state.aborted,
		failureTerminated,
		closeout: state.closeout ?? (failureTerminated ? "parent_terminated_after_first_failure" : "normal"),
		stopReason: result.stopReason,
		malformedStdout: result.malformedStdout,
		sawAssistantMessageEnd: result.sawAssistantMessageEnd,
		protocolTerminal: result.protocolTerminal,
		lateEventsIgnored: result.lateEventsIgnored,
		firstObserved: result.failureCause ?? result.errorMessage ?? "unknown",
	});
}

function inferLikelyFailureRoot(result: AgentRunResult, exitCode: number | undefined, state: RunCompletionState): string {
	const message = result.errorMessage ?? "";
	if (message.startsWith("Subagent assistant error:")) return "child assistant terminal error before parent closeout";
	if (message.startsWith("Working directory is not a directory:")) return "invalid working directory prevented child launch";
	if (message.startsWith("Bash-enabled subagent refused cwd with project settings:")) return "project settings could alter bash execution in the child cwd";
	if (message.startsWith("Extension tool source changed before launch")) return "extension tool source identity changed before child launch";
	if (message.startsWith("Subagent launch error:")) return "parent failed before child process launch completed";
	if (message.startsWith("Subagent process error:")) return "child process spawn or runtime process error";
	if (message.startsWith("Subagent assistant output artifact persistence failed:")) return "parent failed to persist oversized assistant output artifact";
	if (message.startsWith("Subagent stdin transport failed:") || message.startsWith("Subagent stdout stream failed:") || message.startsWith("Subagent stderr stream failed:")) return "local parent-child transport failed";
	if (result.malformedStdout) return "child violated JSON-mode stdout protocol";
	if (state.timedOut) return "parent timeout killed or interrupted the child before completion";
	if (state.aborted) return state.launched === false ? "parent abort before child launch" : "parent abort terminated child";
	if (result.stopReason && result.stopReason !== "stop") return "child runtime reported a non-success assistant stopReason; inspect child stderr/events for provider or policy cause";
	if (state.exitSignal) return "child process exited from a signal";
	if (exitCode !== undefined && exitCode !== 0) return "child process exited non-zero; inspect child stderr/events";
	if (!result.sawAssistantMessageEnd) return "child ended before emitting the required assistant message_end";
	return "child failed after emitting protocol metadata; inspect errorMessage, stderr, and events";
}

export function isFailedResult(result: AgentRunResult): boolean {
	return ["failed", "aborted", "timed_out", "blocked"].includes(result.status);
}

export function isTerminalResult(result: AgentRunResult): boolean {
	return result.status !== "pending" && result.status !== "running";
}

