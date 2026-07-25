import type { ChildSessionMetadata, StepStatus, StepUsage } from "./types.ts";
import type { RpcStepResult } from "./rpc-child-types.ts";
import { firstNonBlank } from "./rpc-tool-events.ts";

export function successRpcStepResult(input: { text: string; assistantFinals: string[]; stderr: string; childSession: ChildSessionMetadata | undefined; parentMessagesAccepted: boolean; usage?: StepUsage }): RpcStepResult {
	return { status: "succeeded", text: input.text, assistantFinals: input.assistantFinals, stderr: input.stderr, errorMessage: undefined, childSession: input.childSession, parentMessagesAccepted: input.parentMessagesAccepted, usage: input.usage };
}

export function terminalStopReason(agentEndStopReason: string | undefined, agentEndErrorMessage: string | undefined, lastAssistantStopReason: string | undefined, lastAssistantErrorMessage: string | undefined): { stopReason: string | undefined; errorMessage: string | undefined } {
	const assistantStopReason = lastAssistantStopReason && lastAssistantStopReason !== "stop" ? lastAssistantStopReason : undefined;
	return { stopReason: assistantStopReason ?? agentEndStopReason ?? lastAssistantStopReason, errorMessage: assistantStopReason ? lastAssistantErrorMessage : agentEndErrorMessage ?? lastAssistantErrorMessage };
}

export function emptyAssistantFinalFailure(recoveringOverflow: boolean): { message: string; label: string } {
	return recoveringOverflow ? { message: "context-overflow-unrecovered: child reported context overflow but did not produce a valid post-recovery assistant final.", label: "context-overflow-unrecovered" } : { message: "assistant-final-empty: no assistant final text captured after agent_end and command ACKs.", label: "assistant-final-empty" };
}

export function failureRpcStepResult(input: { status: StepStatus; message: string; output: string; liveText: string; assistantFinals: string[]; stderr: string; lastAssistantStopReason: string | undefined; childSession: ChildSessionMetadata | undefined; parentMessagesAccepted: boolean; usage?: StepUsage }): RpcStepResult {
	const nonFinalText = nonFinalEvidence(input);
	return { status: input.status, text: input.output, assistantFinals: input.assistantFinals, stderr: input.stderr, errorMessage: input.message, childSession: input.childSession, parentMessagesAccepted: input.parentMessagesAccepted, usage: input.usage, ...(nonFinalText ? { nonFinalText } : {}) };
}

function nonFinalEvidence(input: { status: StepStatus; output: string; liveText: string; assistantFinals: string[]; lastAssistantStopReason: string | undefined }): string | undefined {
	const text = firstNonBlank(input.liveText, input.output);
	if (!text) return undefined;
	const lastFinal = input.assistantFinals.at(-1);
	if (lastFinal !== undefined && text.trim() === lastFinal.trim()) return undefined;
	return text;
}
