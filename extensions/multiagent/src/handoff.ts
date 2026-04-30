/** Automatic upstream output handoff preparation for dependent subagents. */

import type { AgentDiagnostic, AgentRunResult, ResolvedAgent, TeamStepSpec } from "./types.ts";
import { INLINE_HANDOFF_CHARS } from "./types.ts";
import { appendDiagnostic } from "./json-events.ts";
import { isReadableFile, persistFullStepOutput } from "./output-files.ts";
import { makeDiagnostic } from "./planning.ts";
import { hasReadTool } from "./tool-policy.ts";

export interface AutomaticHandoff {
	launchAgent: ResolvedAgent;
	blockReason: string | undefined;
}

export async function prepareAutomaticHandoff(step: TeamStepSpec, agent: ResolvedAgent, upstream: AgentRunResult[], diagnostics: AgentDiagnostic[]): Promise<AutomaticHandoff> {
	const oversized = upstream.filter((result) => result.outputFull.length > INLINE_HANDOFF_CHARS);
	if (oversized.length === 0) return { launchAgent: agent, blockReason: undefined };
	for (const result of oversized) await persistFullStepOutput(result);
	const missing = oversized.find((result) => !result.fullOutputPath || !isReadableFile(result.fullOutputPath));
	if (missing) {
		if (missing.fullOutputPath) {
			appendDiagnostic(missing, `Discarded stale fullOutputPath for ${missing.id} because the artifact could not be read.`);
			missing.fullOutputPath = undefined;
		}
		return { launchAgent: agent, blockReason: `Blocked: upstream output for ${missing.id} exceeded ${INLINE_HANDOFF_CHARS} chars and artifact is unavailable.` };
	}
	if (hasReadTool(agent.tools)) return { launchAgent: agent, blockReason: undefined };
	diagnostics.push(makeDiagnostic("handoff-read-auto-added", `Step ${step.id} receives oversized upstream output; added read for artifact refs.`, "info", step.synthesis ? "/synthesis/agent" : undefined));
	return { launchAgent: { ...agent, tools: [...agent.tools, "read"] }, blockReason: undefined };
}
