import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { AssistantOutputBudget, type OutputBudgetFailure } from "./rpc-output-budget.ts";
import { RpcCommandQueue, type RpcCommandAck } from "./rpc-command-queue.ts";
import { combinedAssistantFinals, envelopeParentMessage, extractAgentEndErrorMessage, extractAgentEndStopReason, extractEventText, hasAgentEndErrorMetadata, isAgentEndContextOverflow } from "./rpc-record-utils.ts";
import { STDERR_PREVIEW_CHARS, type StepStatus } from "./types.ts";
import { buildPiArgs, getPiInvocation, killProcessTree, type SpawnProcess } from "./child-launch.ts";
import type { RpcJsonRecord } from "./rpc-jsonl.ts";
import { RpcChildListeners } from "./rpc-child-listeners.ts";
import { handleUnattendedUiRequest } from "./rpc-ui-request.ts";
import { ParentMessageBudget } from "./rpc-parent-message-budget.ts";
import { handleAssistantMessageUpdate } from "./rpc-message-update.ts";
import { terminateRpcChild } from "./rpc-child-termination.ts";
import { scheduleRpcExitCloseout } from "./rpc-child-exit-closeout.ts";
import { RpcChildObservability } from "./rpc-child-observability.ts";
import { processAssistantMessageEnd, RpcUsageTracker } from "./rpc-message-end-handler.ts";
import { emptyAssistantFinalFailure, failureRpcStepResult, successRpcStepResult, terminalStopReason } from "./rpc-step-result-builder.ts";
import { handleRpcToolEvent } from "./rpc-tool-event-handler.ts";
import type { RpcChildControllerOptions, RpcStepResult } from "./rpc-child-types.ts";

const ACK_TIMEOUT_MS = 10_000;
export class RpcChildController {
	private readonly options: RpcChildControllerOptions;
	private readonly commands: RpcCommandQueue;
	private child: ChildProcessWithoutNullStreams | undefined;
	private completionResolve: ((result: RpcStepResult) => void) | undefined;
	private closingResult: RpcStepResult | undefined;
	private finalized = false;
	private terminating = false;
	private childClosed = false;
	private childExited = false;
	private sawAgentEnd = false;
	private agentEndStopReason: string | undefined;
	private agentEndErrorMessage: string | undefined;
	private lastAssistantStopReason: string | undefined;
	private lastAssistantErrorMessage: string | undefined;
	private agentEndWillRetry = false;
	private recoveringOverflow = false;
	private output = "";
	private assistantFinals: string[] = [];
	private readonly outputBudget: AssistantOutputBudget;
	private liveText = "";
	private stderr = "";
	private readonly parentMessageBudget = new ParentMessageBudget();
	private readonly observability: RpcChildObservability;
	private timeoutTimer: ReturnType<typeof setTimeout> | undefined;
	private killTimer: ReturnType<typeof setTimeout> | undefined;
	private exitCloseTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly listeners = new RpcChildListeners();
	private spawnProcess: SpawnProcess;
	private readonly usageTracker = new RpcUsageTracker();

	constructor(options: RpcChildControllerOptions) {
		this.options = options;
		this.spawnProcess = options.spawnProcess ?? spawn;
		this.outputBudget = new AssistantOutputBudget(options.outputLimit);
		const ackTimeoutMs = Number.isFinite(options.ackTimeoutMs) && options.ackTimeoutMs !== undefined && options.ackTimeoutMs > 0 ? Math.trunc(options.ackTimeoutMs) : ACK_TIMEOUT_MS;
		this.commands = new RpcCommandQueue(ackTimeoutMs);
		this.observability = new RpcChildObservability({ sessionDir: options.sessionDir, progressWatchdogMs: options.progressWatchdogMs, onEvent: options.onEvent, onChildSession: options.onChildSession });
	}

	async run(task: string): Promise<RpcStepResult> {
		const args = buildPiArgs(this.options.agent, this.options.defaults, this.options.promptPath, { sessionDir: this.options.sessionDir, sessionName: this.options.sessionName });
		const invocation = getPiInvocation(args, this.options.cwd);
		this.child = this.spawnProcess(invocation.command, invocation.args, { cwd: this.options.cwd, shell: false, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
		this.child.unref?.();
		this.observability.progress("spawn");
		this.observability.start();
		this.options.onEvent({ type: "rpc", label: "spawn", preview: "child spawned", status: "running" });
		this.listeners.attach(this.child, { onRecord: (record) => this.handleRecord(record), onStdoutError: (message) => this.handleStdoutError(message), onStderrData: (text) => this.appendStderr(text), onStderrError: (error) => this.handleStderrError(error), onStdinError: (error) => this.handleStdinError(error), onChildError: (error) => this.fail("failed", `Subagent process error: ${error.message}`), onExit: () => this.handleExit(), onClose: () => this.handleClose() });
		this.timeoutTimer = setTimeout(() => this.fail("timed_out", this.recoveringOverflow ? `context-overflow-unrecovered: timeoutSecondsPerStep=${this.options.limits.timeoutSecondsPerStep} exceeded before a valid post-recovery assistant final.` : `timeoutSecondsPerStep=${this.options.limits.timeoutSecondsPerStep} exceeded.`, this.recoveringOverflow ? "context-overflow-unrecovered" : "timed_out"), this.options.limits.timeoutSecondsPerStep * 1000);
		this.timeoutTimer.unref?.();
		const completion = new Promise<RpcStepResult>((resolve) => {
			this.completionResolve = resolve;
		});
		await this.observability.captureChildSession((command) => this.sendCommand(command));
		if (this.closingResult || this.finalized) return completion;
		this.options.onEvent({ type: "rpc", label: "prompt", preview: "sent", status: "running" });
		const ack = await this.sendCommand({ type: "prompt", message: task });
		if (!ack.success) this.fail("failed", ack.error ?? "Prompt rejected.");
		else {
			this.observability.progress("prompt accepted");
			this.options.onEvent({ type: "rpc", label: "prompt", preview: "accepted", status: "done" });
		}
		return completion;
	}

	async message(channel: "steer" | "follow_up", text: string): Promise<RpcCommandAck> {
		if (this.finalized || this.closingResult || this.terminating) return { success: false, error: "Step is not live." };
		const budgetError = this.parentMessageBudget.reserve(text);
		if (budgetError) return { success: false, error: budgetError };
		const commandType = channel === "steer" ? "steer" : "follow_up";
		const message = envelopeParentMessage(channel, text);
		this.observability.messageSending(channel);
		const ack = await this.sendCommand({ type: commandType, message });
		this.observability.messageAck(channel, message, ack);
		this.maybeFinalize();
		return ack;
	}

	cancel(reason: string | undefined): void {
		if (this.finalized || this.closingResult) return;
		this.options.onEvent({ type: "diagnostic", label: "cancel", preview: reason ?? "cancel requested", status: "running" });
		void this.sendCommand({ type: "abort" });
		this.fail("canceled", reason ?? "Run canceled.");
	}

	forceKill(reason: string): void {
		if (!this.child || this.childClosed || this.childExited) return;
		if (this.killTimer) clearTimeout(this.killTimer);
		this.options.onEvent({ type: "diagnostic", label: "SIGKILL", preview: reason, status: "error" });
		if (!killProcessTree(this.child, "SIGKILL")) this.options.onEvent({ type: "diagnostic", label: "SIGKILL", preview: "not accepted", status: "error" });
		if (this.closingResult) this.complete(this.closingResult);
	}

	private handleStdoutError(message: string): void {
		const normalized = message.startsWith("RPC JSONL stream error:") ? message.replace("RPC JSONL", "RPC stdout") : message;
		this.fail("failed", normalized, normalized.includes("stream error") ? "stdout-error" : "rpc-jsonl");
	}

	private handleStdinError(error: Error): void {
		const message = `RPC stdin stream error: ${error.message}`;
		if (this.finalized) return;
		if (this.closingResult) {
			this.options.onEvent({ type: "diagnostic", label: "stdin-error", preview: message, status: "error" });
			return;
		}
		this.fail("failed", message, "stdin-error");
	}

	private handleStderrError(error: Error): void {
		const message = `RPC stderr stream error: ${error.message}`;
		if (this.finalized) return;
		if (this.closingResult) {
			this.options.onEvent({ type: "diagnostic", label: "stderr-error", preview: message, status: "error" });
			return;
		}
		this.fail("failed", message, "stderr-error");
	}

	private sendCommand(command: RpcJsonRecord): Promise<RpcCommandAck> {
		if (this.finalized || this.closingResult) return Promise.resolve({ success: false, error: "RPC child is not live." });
		return this.commands.send(this.child?.stdin, command);
	}

	private handleRecord(record: RpcJsonRecord): void {
		if (this.finalized || this.closingResult) return;
		const type = typeof record.type === "string" ? record.type : "unknown";
		this.observability.progress(type);
		if (type === "response") {
			this.handleResponse(record);
			return;
		}
		if (this.observability.handleQueueUpdate(record)) return;
		if (type === "message_update") this.handleMessageUpdate(record);
		else if (type === "message_end") this.handleMessageEnd(record);
		else if (type === "agent_end") this.handleAgentEnd(record);
		else if (type === "tool_execution_start" || type === "tool_execution_update" || type === "tool_execution_end") this.handleToolEvent(type, record);
		else if (type === "extension_ui_request") this.handleUiRequest(record);
		else if (type === "extension_error") this.options.onEvent({ type: "diagnostic", label: "extension_error", preview: extractEventText(record), status: "error" });
		else this.options.onEvent({ type: "rpc", label: type, preview: extractEventText(record) });
	}

	private handleResponse(record: RpcJsonRecord): void {
		this.commands.handleResponse(record, ({ command, message }) => this.options.onEvent({ type: "diagnostic", label: command, preview: message, status: "error" }));
		this.maybeFinalize();
	}

	private handleAgentEnd(record: RpcJsonRecord): void {
		this.sawAgentEnd = true;
		this.agentEndWillRetry = record.willRetry === true;
		this.agentEndStopReason = extractAgentEndStopReason(record);
		this.agentEndErrorMessage = extractAgentEndErrorMessage(record);
		const preview = this.agentEndStopReason ? `stopReason=${this.agentEndStopReason}` : "terminal event";
		const suffix = this.agentEndErrorMessage ? `: ${this.agentEndErrorMessage}` : "";
		this.options.onEvent({ type: "rpc", label: "agent_end", preview: `${preview}${suffix}`, status: "done" });
		if (isAgentEndContextOverflow(record)) {
			this.enterContextOverflowRecovery("agent_end", this.agentEndErrorMessage ?? extractEventText(record));
			return;
		}
		if (hasAgentEndErrorMetadata(record) && (!this.agentEndStopReason || this.agentEndStopReason === "stop")) this.agentEndStopReason = "error";
		if (this.agentEndWillRetry) {
			this.options.onEvent({ type: "rpc", label: "agent_end_retry", preview: "child reported a continuation after agent_end", status: "running" });
			this.sawAgentEnd = false;
			this.agentEndStopReason = undefined;
			this.agentEndErrorMessage = undefined;
			return;
		}
		this.observability.terminalNoRetry();
		this.maybeFinalize();
	}

	private handleMessageUpdate(record: RpcJsonRecord): void {
		this.observability.progress("assistant message update");
		this.liveText = handleAssistantMessageUpdate(record, { liveText: this.liveText, outputBudget: this.outputBudget, failOutputBudget: (failure) => this.failOutputBudget(failure), onText: this.options.onText, onEvent: this.options.onEvent });
	}

	private handleMessageEnd(record: RpcJsonRecord): void {
		this.observability.progress("assistant message_end");
		const result = processAssistantMessageEnd(record, { output: this.output, liveText: this.liveText, assistantFinals: this.assistantFinals }, { outputBudget: this.outputBudget, onText: this.options.onText, onEvent: this.options.onEvent });
		this.output = result.output;
		this.liveText = result.liveText;
		this.assistantFinals = result.assistantFinals;
		this.lastAssistantStopReason = result.stopReason;
		this.lastAssistantErrorMessage = result.errorMessage;
		if (result.contextOverflowMessage !== undefined) this.enterContextOverflowRecovery("assistant", result.contextOverflowMessage);
		else if (result.outputBudgetFailure) this.failOutputBudget(result.outputBudgetFailure);
		this.usageTracker.accumulate(record);
	}

	private failOutputBudget(failure: OutputBudgetFailure): void {
		this.fail("failed", failure.message, failure.label);
	}

	private handleToolEvent(type: string, record: RpcJsonRecord): void {
		this.observability.progress(type);
		handleRpcToolEvent(type, record, this.options.onEvent);
	}

	private handleUiRequest(record: RpcJsonRecord): void {
		handleUnattendedUiRequest({ record, child: this.child, finalized: this.finalized, onEvent: this.options.onEvent, onDenied: (message) => this.fail("failed", message) });
	}

	private maybeFinalize(): void {
		if (!this.sawAgentEnd || this.commands.pendingCount > 0 || this.finalized || this.closingResult) return;
		const { stopReason, errorMessage } = terminalStopReason(this.agentEndStopReason, this.agentEndErrorMessage, this.lastAssistantStopReason, this.lastAssistantErrorMessage);
		if (stopReason && stopReason !== "stop") {
			const message = errorMessage ? `Subagent RPC ended with stopReason ${stopReason}: ${errorMessage}` : `Subagent RPC ended with stopReason ${stopReason}.`;
			this.fail("failed", message, stopReason === "error" ? "assistant-error" : "assistant-stop");
			return;
		}
		const text = combinedAssistantFinals(this.assistantFinals);
		if (text.trim().length === 0) {
			const failure = emptyAssistantFinalFailure(this.recoveringOverflow);
			this.fail("failed", failure.message, failure.label);
			return;
		}
		this.finalize(successRpcStepResult({ text, assistantFinals: [...this.assistantFinals], stderr: this.stderr, childSession: this.observability.session, parentMessagesAccepted: this.observability.parentMessagesAccepted, usage: this.usageTracker.snapshot() }));
	}

	private failureResult(status: StepStatus, message: string): RpcStepResult {
		return failureRpcStepResult({ status, message, output: this.output, liveText: this.liveText, assistantFinals: [...this.assistantFinals], stderr: this.stderr, lastAssistantStopReason: this.lastAssistantStopReason, childSession: this.observability.session, parentMessagesAccepted: this.observability.parentMessagesAccepted, usage: this.usageTracker.snapshot() });
	}

	private enterContextOverflowRecovery(label: string, message: string): void {
		if (this.finalized || this.closingResult) return;
		this.recoveringOverflow = true;
		this.sawAgentEnd = false;
		this.agentEndStopReason = undefined;
		this.agentEndErrorMessage = undefined;
		this.lastAssistantStopReason = undefined;
		this.lastAssistantErrorMessage = undefined;
		this.agentEndWillRetry = false;
		this.output = "";
		this.liveText = "";
		this.assistantFinals = [];
		this.outputBudget.resetLiveText();
		this.outputBudget.resetAssistantFinals();
		this.options.onText?.(this.liveText);
		this.observability.progress("context overflow recovery");
		this.options.onEvent({ type: "diagnostic", label: "context_overflow_recovering", preview: `recovering after ${label}: ${message}`, status: "running" });
	}

	private fail(status: StepStatus, message: string, label: string = status): void {
		if (this.finalized || this.closingResult) return;
		this.options.onEvent({ type: "diagnostic", label, preview: message, status: "error" });
		this.finalize(this.failureResult(status, message));
	}

	private finalize(result: RpcStepResult): void {
		if (this.finalized || this.closingResult) return;
		this.observability.terminalNoRetry();
		const closingResult = { ...result, childSession: result.childSession ?? this.observability.session };
		this.closingResult = closingResult;
		this.observability.stop();
		this.options.onEvent({ type: "rpc", label: "terminalizing", preview: closingResult.status, status: "running" });
		if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
		this.commands.closeWith((command) => `RPC command ${command} closed by finalization.`);
		this.listeners.detachIo(false, true);
		this.terminateChild();
		if (!this.child || this.childClosed || this.childExited || this.child.exitCode !== null) this.complete(closingResult);
	}

	private handleExit(): void {
		this.childExited = true;
		if (this.childClosed || this.finalized) return;
		this.exitCloseTimer = scheduleRpcExitCloseout({ childClosed: () => this.childClosed, finalized: () => this.finalized, closingResult: () => this.closingResult, recoveringOverflow: () => this.recoveringOverflow, onEvent: this.options.onEvent, complete: (result) => this.complete(result), fail: (status, message, label) => this.fail(status, message, label) });
	}

	private handleClose(): void {
		this.childClosed = true;
		if (this.killTimer) clearTimeout(this.killTimer);
		if (this.exitCloseTimer) clearTimeout(this.exitCloseTimer);
		if (this.closingResult) {
			this.complete(this.closingResult);
			return;
		}
		if (!this.finalized) this.fail("failed", this.recoveringOverflow ? "context-overflow-unrecovered: child closed before a valid post-recovery assistant final." : "Subagent closed before agent_end.", this.recoveringOverflow ? "context-overflow-unrecovered" : "failed");
	}

	private complete(result: RpcStepResult): void {
		if (this.finalized) return;
		this.finalized = true;
		this.observability.stop();
		if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
		if (this.killTimer) clearTimeout(this.killTimer);
		if (this.exitCloseTimer) clearTimeout(this.exitCloseTimer);
		this.listeners.detachForCompletion(!!this.child && !this.childClosed);
		this.completionResolve?.(result);
		this.completionResolve = undefined;
	}

	private terminateChild(): void {
		terminateRpcChild({ child: this.child, isTerminating: () => this.terminating, markTerminating: () => { this.terminating = true; }, isChildClosed: () => this.childClosed, isChildExited: () => this.childExited, closingResult: () => this.closingResult, setKillTimer: (timer) => { this.killTimer = timer; }, onEvent: this.options.onEvent, complete: (result) => this.complete(result) });
	}

	private appendStderr(text: string): void {
		if (text.length === 0) return;
		this.observability.progress("stderr");
		this.stderr = `${this.stderr}${text}`;
		if (this.stderr.length > STDERR_PREVIEW_CHARS) this.stderr = this.stderr.slice(this.stderr.length - STDERR_PREVIEW_CHARS);
	}

}
