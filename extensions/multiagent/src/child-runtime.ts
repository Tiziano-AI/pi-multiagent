/** Child Pi JSON-mode process runtime and stream handling. */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { appendDiagnostic, appendStderr, applyJsonEvent, markMalformedStdout, noteFailureCause, parseJsonRecordLine } from "./json-events.ts";
import { hasDefinitelyMalformedJsonObjectPrefix } from "./json-prefix.ts";
import { trimJsonWhitespace, trimStartJsonWhitespace } from "./json-whitespace.ts";
import { buildPiArgs, getPiInvocation, type SpawnProcess } from "./child-launch.ts";
import { classifyPostTerminalLifecycle, createPostTerminalLifecycleState, finishPostTerminalLifecycleState, type PostTerminalLifecycleState } from "./post-terminal-lifecycle.ts";
import { MAX_JSON_STDOUT_LINE_CHARS, MAX_STDOUT_LINE_CHARS } from "./types.ts";
import type { AgentInvocationDefaults, AgentRunResult, ResolvedAgent, TeamLimits } from "./types.ts";

const SIGKILL_CONFIRM_MS = 500;
const SIGTERM_GRACE_MS = 5_000;
const UNDELIMITED_JSON_GRACE_MS = 250;

export interface ProcessOutcome {
	exitCode: number | undefined;
	exitSignal: string | undefined;
	aborted: boolean;
	timedOut: boolean;
	failureTerminated: boolean;
	launched: boolean;
	closeout: string | undefined;
}

export async function spawnPiJson(options: {
	agent: ResolvedAgent;
	defaults: AgentInvocationDefaults;
	limits: TeamLimits;
	cwd: string;
	promptPath: string;
	task: string;
	result: AgentRunResult;
	signal: AbortSignal | undefined;
	spawnProcess: SpawnProcess;
	onPartial: () => void;
}): Promise<ProcessOutcome> {
	if (options.signal?.aborted) return Promise.resolve({ exitCode: undefined, exitSignal: undefined, aborted: true, timedOut: false, failureTerminated: false, launched: false, closeout: "no_child_process" });
	const args = buildPiArgs(options.agent, options.defaults, options.promptPath);
	return new Promise((resolveExit) => {
		let settled = false;
		let buffer = "";
		let firstCause: "abort" | "timeout" | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
		let undelimitedJsonTimer: ReturnType<typeof setTimeout> | undefined;
		let terminating = false;
		let failureTerminating = false;
		const stdoutDecoder = new StringDecoder("utf8");
		const stderrDecoder = new StringDecoder("utf8");
		const postTerminalLifecycle = createPostTerminalLifecycleState();
		const clearUndelimitedJsonTimer = () => {
			if (!undelimitedJsonTimer) return;
			clearTimeout(undelimitedJsonTimer);
			undelimitedJsonTimer = undefined;
		};
		const settle = (exitCode: number | undefined, exitSignal: string | undefined, closeout: string | undefined = undefined) => {
			if (settled) return;
			settled = true;
			options.signal?.removeEventListener("abort", onAbort);
			if (killTimer) clearTimeout(killTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			clearUndelimitedJsonTimer();
			resolveExit({ exitCode, exitSignal, aborted: firstCause === "abort", timedOut: firstCause === "timeout", failureTerminated: failureTerminating, launched: true, closeout });
		};
		const invocation = getPiInvocation(args, options.cwd);
		const child = options.spawnProcess(invocation.command, invocation.args, { cwd: options.cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
		const settleUnconfirmedKill = () => {
			appendDiagnostic(options.result, "Subagent did not emit process close after SIGKILL; termination is unconfirmed.");
			options.onPartial();
			settle(undefined, undefined, "unconfirmed_after_sigkill");
		};
		const terminate = () => {
			if (terminating) return;
			terminating = true;
			if (!child.kill("SIGTERM")) appendDiagnostic(options.result, "SIGTERM was not accepted by the subagent process.");
			killTimer = setTimeout(() => {
				if (child.exitCode === null) {
					if (!child.kill("SIGKILL")) appendDiagnostic(options.result, "SIGKILL was not accepted by the subagent process.");
					killTimer = setTimeout(settleUnconfirmedKill, SIGKILL_CONFIRM_MS);
					return;
				}
				settle(undefined, undefined);
			}, SIGTERM_GRACE_MS);
		};
		const onAbort = () => {
			if (firstCause || failureTerminating) return;
			firstCause = "abort";
			appendDiagnostic(options.result, "Parent abort requested subagent termination.");
			if (timeoutTimer) clearTimeout(timeoutTimer);
			terminate();
		};
		const terminateForProtocolFailure = () => {
			if (!shouldTerminateForProtocolFailure(options.result)) return false;
			failureTerminating = true;
			if (timeoutTimer) clearTimeout(timeoutTimer);
			if (options.result.malformedStdout) {
				options.result.errorMessage = options.result.errorMessage ?? "Subagent emitted non-JSON stdout while running in JSON mode.";
				noteFailureCause(options.result, options.result.errorMessage);
			}
			appendDiagnostic(options.result, `Terminating subagent after protocol failure: ${options.result.errorMessage ?? "unknown cause"}.`);
			options.onPartial();
			terminate();
			return true;
		};
		const scheduleUndelimitedJsonFailure = () => {
			if (undelimitedJsonTimer) return;
			undelimitedJsonTimer = setTimeout(() => {
				undelimitedJsonTimer = undefined;
				if (settled || firstCause || failureTerminating || buffer.length === 0 || !parseJsonRecordLine(buffer)) return;
				if (options.result.protocolTerminal) {
					if (markLateStdout(options.result)) options.onPartial();
				} else {
					markMalformedStdout(options.result, buffer);
					options.onPartial();
				}
				if (buffer.length > MAX_STDOUT_LINE_CHARS) persistOversizedStdout(options.result, buffer);
				buffer = "";
				terminateForProtocolFailure();
			}, UNDELIMITED_JSON_GRACE_MS);
		};
		const processStdoutText = (text: string) => {
			if (settled || firstCause || failureTerminating || text.length === 0) return;
			if (options.result.protocolTerminal) {
				buffer += text;
				let terminalNewline = buffer.indexOf("\n");
				while (terminalNewline !== -1) {
					clearUndelimitedJsonTimer();
					const line = buffer.slice(0, terminalNewline);
					buffer = buffer.slice(terminalNewline + 1);
					processStdoutLine(line, options.result, options.onPartial, postTerminalLifecycle);
					if (settled || firstCause || terminateForProtocolFailure()) return;
					terminalNewline = buffer.indexOf("\n");
				}
				if (shouldFailOversizedPendingBuffer(buffer)) {
					markOversizedStdoutLine(options.result, buffer);
					options.onPartial();
					buffer = "";
					terminateForProtocolFailure();
					return;
				}
				const pending = trimStartJsonWhitespace(buffer);
				if (pending.length > 0 && !pending.startsWith("{")) {
					if (markLateStdout(options.result)) options.onPartial();
					buffer = "";
					terminateForProtocolFailure();
					return;
				}
				if (hasDefinitelyMalformedJsonObjectPrefix(pending)) {
					if (markLateStdout(options.result)) options.onPartial();
					buffer = "";
					terminateForProtocolFailure();
				} else if (parseJsonRecordLine(buffer)) scheduleUndelimitedJsonFailure();
				return;
			}
			buffer += text;
			let newline = buffer.indexOf("\n");
			if (newline === -1 && shouldFailOversizedPendingBuffer(buffer)) {
				markOversizedStdoutLine(options.result, buffer);
				options.onPartial();
				buffer = "";
				terminateForProtocolFailure();
				return;
			}
			while (newline !== -1) {
				clearUndelimitedJsonTimer();
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				processStdoutLine(line, options.result, options.onPartial, postTerminalLifecycle);
				if (settled || firstCause || terminateForProtocolFailure()) return;
				newline = buffer.indexOf("\n");
			}
			if (options.result.protocolTerminal) {
				if (shouldFailOversizedPendingBuffer(buffer)) {
					markOversizedStdoutLine(options.result, buffer);
					options.onPartial();
					buffer = "";
					terminateForProtocolFailure();
					return;
				}
				const pendingTerminal = trimStartJsonWhitespace(buffer);
				if (pendingTerminal.length > 0 && !pendingTerminal.startsWith("{")) {
					if (markLateStdout(options.result)) options.onPartial();
					buffer = "";
					terminateForProtocolFailure();
					return;
				}
				if (hasDefinitelyMalformedJsonObjectPrefix(pendingTerminal)) {
					if (markLateStdout(options.result)) options.onPartial();
					buffer = "";
					terminateForProtocolFailure();
				} else if (parseJsonRecordLine(buffer)) scheduleUndelimitedJsonFailure();
				return;
			}
			if (shouldFailOversizedPendingBuffer(buffer)) {
				markOversizedStdoutLine(options.result, buffer);
				options.onPartial();
				buffer = "";
				terminateForProtocolFailure();
				return;
			}
			const pending = trimStartJsonWhitespace(buffer);
			if (pending.length > 0 && !pending.startsWith("{")) {
				markMalformedStdout(options.result, buffer);
				options.onPartial();
				buffer = "";
				terminateForProtocolFailure();
				return;
			}
			if (hasDefinitelyMalformedJsonObjectPrefix(pending)) {
				markMalformedStdout(options.result, buffer);
				options.onPartial();
				buffer = "";
				terminateForProtocolFailure();
			} else if (parseJsonRecordLine(buffer)) scheduleUndelimitedJsonFailure();
		};
		if (options.signal?.aborted) onAbort();
		else options.signal?.addEventListener("abort", onAbort, { once: true });
		timeoutTimer = setTimeout(() => {
			if (firstCause || failureTerminating) return;
			firstCause = "timeout";
			appendDiagnostic(options.result, `Subagent exceeded limits.timeoutSecondsPerStep=${options.limits.timeoutSecondsPerStep}; terminating.`);
			options.onPartial();
			terminate();
		}, options.limits.timeoutSecondsPerStep * 1000);
		child.stdin.on("error", (error) => {
			if (settled || firstCause) return;
			failureTerminating = true;
			options.result.errorMessage = options.result.errorMessage ?? `Subagent stdin transport failed: ${error.message}`;
			noteFailureCause(options.result, options.result.errorMessage);
			appendDiagnostic(options.result, options.result.errorMessage);
			options.onPartial();
			terminate();
		});
		child.stdout.on("error", (error) => {
			if (settled || firstCause) return;
			failureTerminating = true;
			options.result.errorMessage = options.result.errorMessage ?? `Subagent stdout stream failed: ${error.message}`;
			noteFailureCause(options.result, options.result.errorMessage);
			appendDiagnostic(options.result, options.result.errorMessage);
			options.onPartial();
			terminate();
		});
		child.stderr.on("error", (error) => {
			if (settled || firstCause) return;
			failureTerminating = true;
			options.result.errorMessage = options.result.errorMessage ?? `Subagent stderr stream failed: ${error.message}`;
			noteFailureCause(options.result, options.result.errorMessage);
			appendDiagnostic(options.result, options.result.errorMessage);
			options.onPartial();
			terminate();
		});
		try {
			child.stdin.end(options.task);
		} catch (error) {
			if (!settled && !firstCause) {
				const message = error instanceof Error ? error.message : String(error);
				failureTerminating = true;
				options.result.errorMessage = options.result.errorMessage ?? `Subagent stdin transport failed: ${message}`;
				noteFailureCause(options.result, options.result.errorMessage);
				appendDiagnostic(options.result, options.result.errorMessage);
				options.onPartial();
				terminate();
			}
		}
		child.stdout.on("data", (chunk: Buffer) => processStdoutText(stdoutDecoder.write(chunk)));
		child.stderr.on("data", (chunk: Buffer) => {
			if (settled || firstCause) return;
			const decoded = stderrDecoder.write(chunk);
			if (decoded.length === 0) return;
			appendStderr(options.result, decoded);
			options.onPartial();
		});
		child.on("error", (error) => {
			if (settled) return;
			const message = `Subagent process error: ${error.message}`;
			if (firstCause || terminating || failureTerminating) {
				appendDiagnostic(options.result, message);
				options.onPartial();
				return;
			}
			options.result.errorMessage = options.result.errorMessage ?? message;
			noteFailureCause(options.result, options.result.errorMessage);
			appendDiagnostic(options.result, options.result.errorMessage);
			options.onPartial();
			settle(undefined, undefined);
		});
		child.on("close", (code, closeSignal) => {
			clearUndelimitedJsonTimer();
			if (!settled && !firstCause && !failureTerminating) {
				processStdoutText(stdoutDecoder.end());
				const stderrRest = stderrDecoder.end();
				if (stderrRest.length > 0) appendStderr(options.result, stderrRest);
				if (buffer.length > MAX_STDOUT_LINE_CHARS) {
					markOversizedStdoutLine(options.result, buffer);
					options.onPartial();
				} else if (trimJsonWhitespace(buffer).length > 0) {
					if (options.result.protocolTerminal) {
						if (markLateStdout(options.result)) options.onPartial();
					} else {
						markMalformedStdout(options.result, buffer);
						options.onPartial();
					}
				}
				const lifecycleError = finishPostTerminalLifecycleState(postTerminalLifecycle);
				if (lifecycleError) {
					markPostTerminalProtocolError(options.result, lifecycleError);
					options.onPartial();
				}
			}
			settle(code ?? undefined, closeSignal ?? undefined);
		});
	});
}

function shouldFailOversizedPendingBuffer(buffer: string): boolean {
	if (buffer.length <= MAX_STDOUT_LINE_CHARS) return false;
	const pending = trimStartJsonWhitespace(buffer);
	if (!pending.startsWith("{")) return true;
	if (buffer.length > MAX_JSON_STDOUT_LINE_CHARS) return true;
	return hasDefinitelyMalformedJsonObjectPrefix(pending);
}

function processStdoutLine(line: string, result: AgentRunResult, emit: () => void, postTerminalLifecycle: PostTerminalLifecycleState): void {
	if (line.length <= MAX_STDOUT_LINE_CHARS) {
		processJsonLine(line, result, emit, postTerminalLifecycle);
		return;
	}
	const record = line.length <= MAX_JSON_STDOUT_LINE_CHARS && trimStartJsonWhitespace(line).startsWith("{") ? parseJsonRecordLine(line) : undefined;
	if (!record) {
		markOversizedStdoutLine(result, line);
		emit();
		return;
	}
	const wasMalformed = result.malformedStdout;
	processJsonLine(line, result, emit, postTerminalLifecycle, record);
	if (!wasMalformed && result.malformedStdout) persistOversizedStdout(result, line);
}

function shouldTerminateForProtocolFailure(result: AgentRunResult): boolean {
	if (result.malformedStdout) return true;
	if (result.errorMessage?.startsWith("Subagent assistant output artifact persistence failed:")) return true;
	if (result.errorMessage === "Subagent emitted malformed assistant message_end event.") return true;
	if (result.errorMessage === "Subagent assistant message_end omitted a success stopReason.") return true;
	if (result.errorMessage?.startsWith("Subagent ended with non-success stop reason ")) return true;
	return false;
}

function markOversizedStdoutLine(result: AgentRunResult, text: string): void {
	const message = `Subagent stdout line exceeded JSON-mode safety limit of ${MAX_STDOUT_LINE_CHARS} characters.`;
	result.malformedStdout = true;
	result.errorMessage = result.errorMessage ?? message;
	noteFailureCause(result, result.errorMessage);
	appendDiagnostic(result, message);
	persistOversizedStdout(result, text);
}

function persistOversizedStdout(result: AgentRunResult, text: string): void {
	try {
		const dir = mkdtempSync(join(tmpdir(), "pi-multiagent-stdout-"));
		const filePath = join(dir, `${result.id}-stdout.txt`);
		writeFileSync(filePath, text, { encoding: "utf8", mode: 0o600 });
		appendDiagnostic(result, `Oversized child stdout saved: ${filePath}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		appendDiagnostic(result, `Failed to save oversized child stdout: ${message}`);
	}
}

function processJsonLine(line: string, result: AgentRunResult, emit: () => void, postTerminalLifecycle: PostTerminalLifecycleState, parsedRecord?: Record<string, unknown>): void {
	const record = parsedRecord ?? parseJsonRecordLine(line);
	if (result.protocolTerminal) {
		if (record) {
			const lifecycle = classifyPostTerminalLifecycle(record, postTerminalLifecycle);
			if (lifecycle.accepted) {
				if (applyJsonEvent(result, record, { postTerminalLifecycleAccepted: true })) emit();
				return;
			}
			if (lifecycle.errorMessage) {
				markPostTerminalProtocolError(result, lifecycle.errorMessage);
				emit();
				return;
			}
		}
		if (trimJsonWhitespace(line).length > 0 && markLateStdout(result)) emit();
		return;
	}
	if (!record) {
		if (trimJsonWhitespace(line).length > 0) markMalformedStdout(result, line);
		emit();
		return;
	}
	if (applyJsonEvent(result, record)) emit();
}

function markPostTerminalProtocolError(result: AgentRunResult, message: string): void {
	result.malformedStdout = true;
	result.errorMessage = result.errorMessage ?? message;
	noteFailureCause(result, result.errorMessage);
	appendDiagnostic(result, message);
}

function markLateStdout(result: AgentRunResult): boolean {
	if (result.lateEventsIgnored) return false;
	const message = "Subagent emitted stdout after terminal assistant message_end.";
	result.lateEventsIgnored = true;
	result.malformedStdout = true;
	result.errorMessage = result.errorMessage ?? message;
	noteFailureCause(result, result.errorMessage);
	appendDiagnostic(result, message);
	return true;
}
