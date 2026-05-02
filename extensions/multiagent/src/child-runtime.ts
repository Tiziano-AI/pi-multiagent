/** Child Pi JSON-mode process runtime and stream handling. */

import { StringDecoder } from "node:string_decoder";
import { appendDiagnostic, appendStderr, applyJsonEvent, markMalformedStdout, noteFailureCause, parseJsonRecordLine } from "./json-events.ts";
import { buildPiArgs, getPiInvocation, type SpawnProcess } from "./child-launch.ts";
import { MAX_STDOUT_LINE_CHARS, isRecord } from "./types.ts";
import type { AgentInvocationDefaults, AgentRunResult, ResolvedAgent, TeamLimits } from "./types.ts";

const SIGKILL_CONFIRM_MS = 500;
const SIGTERM_GRACE_MS = 5_000;

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
		let terminating = false;
		let failureTerminating = false;
		const stdoutDecoder = new StringDecoder("utf8");
		const stderrDecoder = new StringDecoder("utf8");
		const postTerminalLifecycle = createPostTerminalLifecycleState();
		const settle = (exitCode: number | undefined, exitSignal: string | undefined, closeout: string | undefined = undefined) => {
			if (settled) return;
			settled = true;
			options.signal?.removeEventListener("abort", onAbort);
			if (killTimer) clearTimeout(killTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
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
		const processStdoutText = (text: string) => {
			if (settled || firstCause || failureTerminating || text.length === 0) return;
			if (options.result.protocolTerminal) {
				buffer += text;
				let terminalNewline = buffer.indexOf("\n");
				while (terminalNewline !== -1) {
					const line = buffer.slice(0, terminalNewline);
					buffer = buffer.slice(terminalNewline + 1);
					processJsonLine(line, options.result, options.onPartial, postTerminalLifecycle);
					if (settled || firstCause || terminateForProtocolFailure()) return;
					terminalNewline = buffer.indexOf("\n");
				}
				if (buffer.length > MAX_STDOUT_LINE_CHARS) {
					if (noteLateStdout(options.result)) options.onPartial();
					buffer = "";
				}
				return;
			}
			buffer += text;
			let newline = buffer.indexOf("\n");
			if (newline === -1 && buffer.length > MAX_STDOUT_LINE_CHARS) {
				markOversizedStdoutLine(options.result);
				options.onPartial();
				terminateForProtocolFailure();
				return;
			}
			while (newline !== -1) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (!options.result.protocolTerminal && line.length > MAX_STDOUT_LINE_CHARS) {
					markOversizedStdoutLine(options.result);
					options.onPartial();
					terminateForProtocolFailure();
					return;
				}
				processJsonLine(line, options.result, options.onPartial, postTerminalLifecycle);
				if (settled || firstCause || terminateForProtocolFailure()) return;
				newline = buffer.indexOf("\n");
			}
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
			if (!settled && !firstCause && !failureTerminating) {
				processStdoutText(stdoutDecoder.end());
				const stderrRest = stderrDecoder.end();
				if (stderrRest.length > 0) appendStderr(options.result, stderrRest);
				if (buffer.trim().length > 0) processJsonLine(buffer, options.result, options.onPartial, postTerminalLifecycle);
			}
			settle(code ?? undefined, closeSignal ?? undefined);
		});
	});
}

function shouldTerminateForProtocolFailure(result: AgentRunResult): boolean {
	if (result.errorMessage?.startsWith("Subagent assistant output artifact persistence failed:")) return true;
	if (result.errorMessage?.startsWith("Subagent JSON stdout line exceeded")) return true;
	if (result.errorMessage?.startsWith("Subagent emitted invalid post-terminal lifecycle event:")) return true;
	if (result.errorMessage === "Subagent emitted malformed assistant message_end event.") return true;
	if (result.malformedStdout && !result.protocolTerminal) return true;
	return false;
}

function markOversizedStdoutLine(result: AgentRunResult): void {
	result.malformedStdout = true;
	result.errorMessage = result.errorMessage ?? `Subagent JSON stdout line exceeded ${MAX_STDOUT_LINE_CHARS} characters.`;
	noteFailureCause(result, result.errorMessage);
	appendDiagnostic(result, result.errorMessage);
}

interface PostTerminalLifecycleState {
	sawTurnEnd: boolean;
	sawAgentEnd: boolean;
}

function createPostTerminalLifecycleState(): PostTerminalLifecycleState {
	return { sawTurnEnd: false, sawAgentEnd: false };
}

function processJsonLine(line: string, result: AgentRunResult, emit: () => void, postTerminalLifecycle: PostTerminalLifecycleState): void {
	const record = parseJsonRecordLine(line);
	if (result.protocolTerminal) {
		if (record) {
			const lifecycle = classifyPostTerminalLifecycle(record, postTerminalLifecycle);
			if (lifecycle.accepted) {
				if (applyJsonEvent(result, record)) emit();
				return;
			}
			if (lifecycle.errorMessage) {
				markPostTerminalProtocolError(result, lifecycle.errorMessage);
				emit();
				return;
			}
		}
		if (line.trim().length > 0 && noteLateStdout(result)) emit();
		return;
	}
	if (!record) {
		if (line.trim().length > 0) markMalformedStdout(result, line);
		emit();
		return;
	}
	if (applyJsonEvent(result, record)) emit();
}

function classifyPostTerminalLifecycle(record: Record<string, unknown>, state: PostTerminalLifecycleState): { accepted: boolean; errorMessage: string | undefined } {
	if (record.type === "auto_retry_end") return classifyPostTerminalAutoRetryEnd(record, state);
	if (record.type === "turn_end") return classifyPostTerminalTurnEnd(record, state);
	if (record.type === "agent_end") return classifyPostTerminalAgentEnd(state);
	return { accepted: false, errorMessage: undefined };
}

function classifyPostTerminalAutoRetryEnd(record: Record<string, unknown>, state: PostTerminalLifecycleState): { accepted: boolean; errorMessage: string | undefined } {
	if (state.sawAgentEnd) return rejectedPostTerminalLifecycle("auto_retry_end after agent_end");
	if (record.success !== true) return rejectedPostTerminalLifecycle("auto_retry_end did not report success");
	return { accepted: true, errorMessage: undefined };
}

function classifyPostTerminalTurnEnd(record: Record<string, unknown>, state: PostTerminalLifecycleState): { accepted: boolean; errorMessage: string | undefined } {
	if (state.sawAgentEnd) return rejectedPostTerminalLifecycle("turn_end after agent_end");
	if (state.sawTurnEnd) return rejectedPostTerminalLifecycle("duplicate turn_end");
	const message = record.message;
	if (!isRecord(message)) return rejectedPostTerminalLifecycle("turn_end missing assistant message");
	if (message.role !== "assistant") return rejectedPostTerminalLifecycle("turn_end message is not assistant role");
	if (message.stopReason !== "stop") return rejectedPostTerminalLifecycle("turn_end stopReason is not stop");
	if (message.errorMessage !== undefined) return rejectedPostTerminalLifecycle("turn_end message includes errorMessage");
	const toolResults = record.toolResults;
	if (!Array.isArray(toolResults)) return rejectedPostTerminalLifecycle("turn_end missing toolResults array");
	if (toolResults.length !== 0) return rejectedPostTerminalLifecycle("turn_end has post-terminal tool results");
	state.sawTurnEnd = true;
	return { accepted: true, errorMessage: undefined };
}

function classifyPostTerminalAgentEnd(state: PostTerminalLifecycleState): { accepted: boolean; errorMessage: string | undefined } {
	if (state.sawAgentEnd) return rejectedPostTerminalLifecycle("duplicate agent_end");
	if (!state.sawTurnEnd) return rejectedPostTerminalLifecycle("agent_end before turn_end");
	state.sawAgentEnd = true;
	return { accepted: true, errorMessage: undefined };
}

function rejectedPostTerminalLifecycle(reason: string): { accepted: boolean; errorMessage: string } {
	return { accepted: false, errorMessage: `Subagent emitted invalid post-terminal lifecycle event: ${reason}.` };
}

function markPostTerminalProtocolError(result: AgentRunResult, message: string): void {
	result.malformedStdout = true;
	result.errorMessage = result.errorMessage ?? message;
	noteFailureCause(result, result.errorMessage);
	appendDiagnostic(result, message);
}

function noteLateStdout(result: AgentRunResult): boolean {
	if (result.lateEventsIgnored) return false;
	result.lateEventsIgnored = true;
	appendDiagnostic(result, "Ignored child stdout after terminal assistant message_end.");
	return true;
}
