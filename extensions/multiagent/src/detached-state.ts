/** Mutable per-step detached-run state. */

import type { RpcChildController } from "./rpc-child-controller.ts";
import type { ChildSessionMetadata, StepOutput, StepRetryRecord, StepStatus, StepUsage, TeamStepSpec } from "./types.ts";

export interface StepState {
	spec: TeamStepSpec;
	status: StepStatus;
	startedAt: string | undefined;
	endedAt: string | undefined;
	errorMessage: string | undefined;
	output: StepOutput | undefined;
	finalText: string | undefined;
	nonFinalText: string | undefined;
	assistantFinals: string[];
	childSession: ChildSessionMetadata | undefined;
	retryHistory: StepRetryRecord[];
	liveText: string;
	liveTextEventChars: number;
	controller: RpcChildController | undefined;
	promise: Promise<void> | undefined;
	usage: StepUsage | undefined;
}

export function createPendingStepState(spec: TeamStepSpec): StepState {
	return { spec, status: "pending", startedAt: undefined, endedAt: undefined, errorMessage: undefined, output: undefined, finalText: undefined, nonFinalText: undefined, assistantFinals: [], childSession: undefined, retryHistory: [], liveText: "", liveTextEventChars: 0, controller: undefined, promise: undefined, usage: undefined };
}
