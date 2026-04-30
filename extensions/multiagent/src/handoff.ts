/** Automatic upstream output handoff preparation for dependent subagents. */

import type { AgentDiagnostic, AgentRunResult, ResolvedAgent, TeamStepSpec } from "./types.ts";
import { INLINE_HANDOFF_CHARS } from "./types.ts";
import { appendDiagnostic } from "./json-events.ts";
import { assistantOutputIsFile, assistantOutputIsReadable, discardUnreadableAssistantOutputArtifact } from "./assistant-output.ts";
import { makeDiagnostic } from "./planning.ts";
import { hasReadTool } from "./tool-policy.ts";

export interface AutomaticHandoff {
	launchAgent: ResolvedAgent;
	blockReason: string | undefined;
}

export async function prepareAutomaticHandoff(step: TeamStepSpec, agent: ResolvedAgent, upstream: AgentRunResult[], diagnostics: AgentDiagnostic[]): Promise<AutomaticHandoff> {
	const oversized = upstream.filter(assistantOutputIsFile);
	if (oversized.length === 0) return { launchAgent: agent, blockReason: undefined };
	const missing = oversized.find((result) => !assistantOutputIsReadable(result));
	if (missing) {
		if (missing.assistantOutput.filePath) {
			appendDiagnostic(missing, `Discarded stale assistant output artifact for ${missing.id} because the artifact could not be read.`);
			discardUnreadableAssistantOutputArtifact(missing);
		}
		return { launchAgent: agent, blockReason: `Blocked: upstream output for ${missing.id} exceeded ${INLINE_HANDOFF_CHARS} chars and artifact is unavailable.` };
	}
	if (hasReadTool(agent.tools)) return { launchAgent: agent, blockReason: undefined };
	diagnostics.push(makeDiagnostic("handoff-read-auto-added", `Step ${step.id} receives oversized upstream output; added read for artifact refs.`, "info", step.synthesis ? "/synthesis/agent" : undefined));
	return { launchAgent: { ...agent, tools: [...agent.tools, "read"] }, blockReason: undefined };
}
