import type { AssistantOutputBudget, OutputBudgetFailure } from "./rpc-output-budget.ts";
import { extractAssistantErrorMessage, extractAssistantStopReason, extractAssistantText, extractEventText, extractMessageUsage, isContextOverflowStop } from "./rpc-record-utils.ts";
import type { RpcJsonRecord } from "./rpc-jsonl.ts";
import type { StepUsage } from "./types.ts";

export class RpcUsageTracker {
	private usage: StepUsage | undefined;

	accumulate(record: RpcJsonRecord): void {
		const u = extractMessageUsage(record);
		if (!u) return;
		if (!this.usage) this.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
		this.usage.input += u.input;
		this.usage.output += u.output;
		this.usage.cacheRead += u.cacheRead;
		this.usage.cacheWrite += u.cacheWrite;
		this.usage.cost += u.cost;
	}

	snapshot(): StepUsage | undefined {
		return this.usage ? { ...this.usage } : undefined;
	}
}

export interface MessageEndState {
	output: string;
	liveText: string;
	assistantFinals: string[];
}

export interface MessageEndResult extends MessageEndState {
	stopReason: string | undefined;
	errorMessage: string | undefined;
	contextOverflowMessage?: string;
	outputBudgetFailure?: OutputBudgetFailure;
}

export function processAssistantMessageEnd(record: RpcJsonRecord, state: MessageEndState, handlers: { outputBudget: AssistantOutputBudget; onText?: (text: string) => void; onEvent: (input: { type: "rpc" | "assistant_final"; label?: string; preview?: string; status?: string }) => void }): MessageEndResult {
	const text = extractAssistantText(record);
	const stopReason = extractAssistantStopReason(record);
	const errorMessage = extractAssistantErrorMessage(record);
	if (isContextOverflowStop(stopReason, errorMessage, extractEventText(record))) return { ...state, stopReason, errorMessage, contextOverflowMessage: errorMessage ?? extractEventText(record) };
	if (text === undefined) return { ...state, stopReason, errorMessage };
	const check = handlers.outputBudget.measureText(text, "assistant final");
	if (!check.ok) return { ...state, stopReason, errorMessage, outputBudgetFailure: check.failure };
	const nonEmpty = text.trim().length > 0;
	const next: MessageEndState = { output: text, liveText: text, assistantFinals: state.assistantFinals };
	handlers.outputBudget.setLiveTextBytes(check.bytes);
	handlers.onText?.(text);
	if (!nonEmpty) {
		handlers.onEvent({ type: "rpc", label: "assistant_final_empty", preview: "empty assistant final ignored", status: "done" });
		return { ...next, stopReason, errorMessage };
	}
	if (stopReason && stopReason !== "stop") {
		const message = errorMessage ? `assistant message ended with stopReason ${stopReason}: ${errorMessage}` : `assistant message ended with stopReason ${stopReason}`;
		handlers.onEvent({ type: "rpc", label: "assistant_nonfinal", preview: message, status: stopReason === "tooluse" ? "done" : "error" });
		return { ...next, stopReason, errorMessage };
	}
	const finalFailure = handlers.outputBudget.canAcceptAssistantFinal(text);
	if (finalFailure) return { ...state, stopReason, errorMessage, outputBudgetFailure: finalFailure };
	handlers.outputBudget.recordAssistantFinal(text);
	const assistantFinals = [...state.assistantFinals, text];
	handlers.onEvent({ type: "assistant_final", label: "assistant", preview: text, status: "done" });
	return { output: text, liveText: text, assistantFinals, stopReason, errorMessage };
}
