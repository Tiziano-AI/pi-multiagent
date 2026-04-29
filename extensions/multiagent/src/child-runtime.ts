/** Child Pi JSON-mode process runtime and stream handling. */

import { StringDecoder } from "node:string_decoder";
import { appendDiagnostic, appendStderr, applyJsonEvent, markMalformedStdout, noteFailureCause, parseJsonRecordLine } from "./json-events.ts";
import { buildPiArgs, getPiInvocation, type SpawnProcess } from "./child-launch.ts";
import type { AgentInvocationDefaults, AgentRunResult, ResolvedAgent, TeamLimits } from "./types.ts";

const MAX_STDOUT_LINE_CHARS = 1_000_000;
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
		const failOversizedStdoutLine = () => {
			buffer = "";
			failureTerminating = true;
			if (timeoutTimer) clearTimeout(timeoutTimer);
			options.result.malformedStdout = true;
			options.result.errorMessage = `Subagent JSON stdout line exceeded ${MAX_STDOUT_LINE_CHARS} characters.`;
			noteFailureCause(options.result, options.result.errorMessage);
			options.onPartial();
			terminate();
		};
		const processStdoutText = (text: string) => {
			if (settled || firstCause || failureTerminating || text.length === 0) return;
			if (options.result.protocolTerminal) {
				buffer = "";
				noteLateStdout(options.result);
				options.onPartial();
				return;
			}
			buffer += text;
			let newline = buffer.indexOf("\n");
			while (newline !== -1) {
				if (newline > MAX_STDOUT_LINE_CHARS) {
					failOversizedStdoutLine();
					return;
				}
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				processJsonLine(line, options.result, options.onPartial);
				if (options.result.protocolTerminal && !shouldTerminateForProtocolFailure(options.result)) {
					if (buffer.trim().length > 0 && noteLateStdout(options.result)) options.onPartial();
					buffer = "";
					return;
				}
				if (settled || firstCause || terminateForProtocolFailure()) return;
				newline = buffer.indexOf("\n");
			}
			if (buffer.length > MAX_STDOUT_LINE_CHARS) failOversizedStdoutLine();
		};
		if (options.signal?.aborted) onAbort();
		else options.signal?.addEventListener("abort", onAbort, { once: true });
		if (options.limits.timeoutSecondsPerStep !== undefined) {
			timeoutTimer = setTimeout(() => {
				if (firstCause || failureTerminating) return;
				firstCause = "timeout";
				appendDiagnostic(options.result, `Subagent exceeded limits.timeoutSecondsPerStep=${options.limits.timeoutSecondsPerStep}; terminating.`);
				options.onPartial();
				terminate();
			}, options.limits.timeoutSecondsPerStep * 1000);
		}
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
				if (buffer.trim().length > 0) processJsonLine(buffer, options.result, options.onPartial);
			}
			settle(code ?? undefined, closeSignal ?? undefined);
		});
	});
}

function shouldTerminateForProtocolFailure(result: AgentRunResult): boolean {
	if (result.outputCaptureTruncated) return true;
	if (result.malformedStdout && !result.protocolTerminal) return true;
	return result.protocolTerminal && result.errorMessage !== undefined;
}

function processJsonLine(line: string, result: AgentRunResult, emit: () => void): void {
	if (result.protocolTerminal) {
		if (line.trim().length > 0 && noteLateStdout(result)) emit();
		return;
	}
	const record = parseJsonRecordLine(line);
	if (!record) {
		if (line.trim().length > 0) markMalformedStdout(result, line);
		emit();
		return;
	}
	if (applyJsonEvent(result, record)) emit();
}

function noteLateStdout(result: AgentRunResult): boolean {
	if (result.lateEventsIgnored) return false;
	result.lateEventsIgnored = true;
	appendDiagnostic(result, "Ignored child stdout after terminal assistant message_end.");
	return true;
}
