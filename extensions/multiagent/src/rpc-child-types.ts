/** Shared RPC child controller types. */

import type { AgentInvocationDefaults, ChildSessionMetadata, ResolvedAgent, StepOutputLimit, StepStatus, StepUsage, TeamLimits } from "./types.ts";

export type RpcChildEventInput = { type: "rpc" | "assistant_final" | "tool" | "diagnostic" | "parent_message" | "ui"; label?: string; preview?: string; status?: string };

export interface RpcChildControllerOptions {
	agent: ResolvedAgent;
	defaults: AgentInvocationDefaults;
	limits: TeamLimits;
	outputLimit: StepOutputLimit;
	cwd: string;
	promptPath: string;
	sessionDir?: string;
	sessionName?: string;
	spawnProcess?: import("./child-launch.ts").SpawnProcess;
	ackTimeoutMs?: number;
	progressWatchdogMs?: number;
	onEvent: (input: RpcChildEventInput) => void;
	onText?: (text: string) => void;
	onChildSession?: (metadata: ChildSessionMetadata) => void;
}

export interface RpcStepResult {
	status: StepStatus;
	text: string;
	assistantFinals: string[];
	stderr: string;
	errorMessage: string | undefined;
	nonFinalText?: string;
	childSession?: ChildSessionMetadata;
	parentMessagesAccepted?: boolean;
	usage?: StepUsage;
}
