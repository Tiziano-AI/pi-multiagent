/** Public result snapshots for progress updates and structured details. */

import type { AgentRunResult, CatalogAgentSummary, PublicResolvedAgent, ResolvedAgent } from "./types.ts";

export function snapshotResult(result: AgentRunResult): AgentRunResult {
	return {
		...result,
		events: result.events.map((event) => ({ ...event })),
		usage: { ...result.usage },
	};
}

export function snapshotAgent(agent: ResolvedAgent): PublicResolvedAgent {
	return {
		id: agent.id,
		ref: agent.ref,
		name: agent.name,
		kind: agent.kind,
		description: agent.description,
		tools: [...agent.tools],
		model: agent.model,
		thinking: agent.thinking,
		source: agent.source,
		filePath: agent.filePath,
		sha256: agent.sha256,
		cwd: agent.cwd,
		outputContract: agent.outputContract,
	};
}

export function snapshotCatalogAgent(agent: CatalogAgentSummary): CatalogAgentSummary {
	return {
		...agent,
		tools: agent.tools ? [...agent.tools] : undefined,
	};
}
