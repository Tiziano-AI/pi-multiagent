/** Snapshot helpers for detached-run surfaces. */

import { isTerminalRunStatus } from "./detached-output.ts";
import type { StepState } from "./detached-state.ts";
import type { StepActivityTracker } from "./step-activity.ts";
import { childToolNames } from "./tool-policy.ts";
import type { AgentInvocationDefaults, RunSnapshot, RunStatus, StepArtifactReference, StepSnapshot, StepStatus, StepUsage, TeamStepSpec } from "./types.ts";
import { effectiveAgentInvocation } from "./agent-invocation.ts";
import { nonDefaultStepOutputLimit } from "./step-output-limit.ts";

export function buildStepSnapshots(states: Iterable<StepState>, activity: StepActivityTracker, defaults: AgentInvocationDefaults = { model: undefined, thinking: undefined }): StepSnapshot[] {
	const stateList = [...states];
	const byId = new Map(stateList.map((state) => [state.spec.id, state]));
	return stateList.map((state) => {
		const invocation = effectiveAgentInvocation(state.spec.agent, defaults);
		return {
			id: state.spec.id,
			status: state.status,
			agentRef: state.spec.agent.ref,
			model: invocation.model,
			thinking: invocation.thinking,
			effectiveTools: childToolNames(state.spec.agent),
			extensionTools: state.spec.agent.extensionTools.map((tool) => tool.name),
			callerSkills: state.spec.agent.callerSkills.map((skill) => skill.name),
			outputLimit: nonDefaultStepOutputLimit(state.spec.outputLimit),
			needs: state.spec.needs,
			after: state.spec.after,
			startedAt: state.startedAt,
			endedAt: state.endedAt,
			lastActivity: activity.summary(state.spec.id),
			errorMessage: state.errorMessage,
			outputFilePath: state.output?.filePath,
			outputChars: state.output?.chars,
			taskPreview: taskPreview(state.spec.task),
			cwd: state.spec.cwd,
			stopReason: state.errorMessage ?? (isTerminalStepStatus(state.status) ? state.status : undefined),
			upstreamArtifacts: upstreamArtifactReferences(state.spec, byId),
			childSession: state.childSession,
			retryHistory: state.retryHistory.length > 0 ? state.retryHistory : undefined,
			usage: state.usage ?? undefined,
		};
	});
}

const TASK_PREVIEW_CHARS = 180;

function taskPreview(task: string): string {
	const normalized = task.replace(/\s+/g, " ").trim();
	return normalized.length <= TASK_PREVIEW_CHARS ? normalized : `${normalized.slice(0, TASK_PREVIEW_CHARS)}... [truncated ${normalized.length - TASK_PREVIEW_CHARS} chars]`;
}

function upstreamArtifactReferences(step: TeamStepSpec, byId: Map<string, StepState>): StepArtifactReference[] {
	return [...step.needs, ...step.after].map((stepId) => {
		const state = byId.get(stepId);
		return { stepId, status: state?.status ?? "missing", filePath: state?.output?.filePath, chars: state?.output?.chars };
	});
}

function isTerminalStepStatus(status: StepStatus): boolean {
	return status !== "pending" && status !== "running";
}

export function sumStepUsages(states: Iterable<StepState>): StepUsage | undefined {
	let total: StepUsage | undefined;
	for (const state of states) {
		if (!state.usage) continue;
		if (!total) total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
		total.input += state.usage.input;
		total.output += state.usage.output;
		total.cacheRead += state.usage.cacheRead;
		total.cacheWrite += state.usage.cacheWrite;
		total.cost += state.usage.cost;
	}
	return total;
}

export function buildRunSnapshot(input: { runId: string; objective: string; status: RunStatus; createdAt: string; updatedAt: string; retentionSeconds: number; liveStepIds: string[]; sinkStepIds: string[]; lastEvent: string | undefined; canMessage: boolean; canCancel: boolean; counts: Record<StepStatus, number>; teamUsage?: StepUsage }): RunSnapshot {
	const terminal = isTerminalRunStatus(input.status);
	return { runId: input.runId, objective: input.objective, status: input.status, terminal, createdAt: input.createdAt, updatedAt: input.updatedAt, expiresAt: terminal ? new Date(Date.parse(input.updatedAt) + input.retentionSeconds * 1000).toISOString() : undefined, liveStepIds: input.liveStepIds, sinkStepIds: input.sinkStepIds, lastEvent: input.lastEvent, canMessage: input.canMessage, canCancel: input.canCancel, canCleanup: terminal, counts: input.counts, teamUsage: input.teamUsage };
}

export function countStepStatuses(states: Iterable<StepState>): Record<StepStatus, number> {
	const counts: Record<StepStatus, number> = { pending: 0, running: 0, succeeded: 0, failed: 0, blocked: 0, timed_out: 0, canceled: 0 };
	for (const state of states) counts[state.status] += 1;
	return counts;
}

export function findSinkStepIds(steps: TeamStepSpec[]): string[] {
	const dependedOn = new Set<string>();
	for (const step of steps) for (const dependency of [...step.needs, ...step.after]) dependedOn.add(dependency);
	return steps.filter((step) => !dependedOn.has(step.id)).map((step) => step.id);
}
