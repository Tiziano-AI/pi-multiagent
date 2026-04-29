/** Fail-closed project-agent library policy for agent_team. */

import { normalizeLibraryOptions } from "./agents.ts";
import type { AgentTeamInput } from "./schemas.ts";
import type { AgentDiagnostic, LibraryOptions } from "./types.ts";

export interface ProjectAgentConfirmationContext {
	hasUI: boolean;
	confirmProjectAgents: ((projectAgentsDir: string | undefined) => Promise<boolean>) | undefined;
	confirmationBlockedReason?: string | undefined;
	projectAgentsDir?: string | undefined;
}

export async function prepareLibraryOptions(
	input: AgentTeamInput,
	ctx: ProjectAgentConfirmationContext,
): Promise<{ library: LibraryOptions; diagnostics: AgentDiagnostic[] }> {
	const library = normalizeLibraryOptions(input.library);
	const diagnostics: AgentDiagnostic[] = [];
	if (!library.sources.includes("project") || library.projectAgents !== "confirm") return { library, diagnostics };
	if (ctx.confirmationBlockedReason) {
		return denyProjectAgents(library, {
			code: "project-agents-confirm-skipped",
			message: `Project library confirmation skipped because ${ctx.confirmationBlockedReason}. Project source denied.`,
			severity: "warning",
		}, ctx.projectAgentsDir);
	}
	if (!ctx.hasUI || !ctx.confirmProjectAgents) {
		return denyProjectAgents(library, {
			code: "project-agents-confirm-unavailable",
			message: 'Project library source requested with projectAgents "confirm", but no UI is available. Project source denied.',
			severity: "warning",
		}, ctx.projectAgentsDir);
	}
	let approved: boolean;
	try {
		approved = await ctx.confirmProjectAgents(ctx.projectAgentsDir);
	} catch {
		return denyProjectAgents(library, {
			code: "project-agents-confirm-failed",
			message: "Project library confirmation failed before approval was recorded. Project source denied.",
			severity: "warning",
		}, ctx.projectAgentsDir);
	}
	if (approved) {
		return {
			library: { ...library, projectAgents: "allow" },
			diagnostics: [
				{
					code: "project-agents-confirm-approved",
					message: `Project library source approved through Pi UI confirmation for this agent_team call${ctx.projectAgentsDir ? `: ${ctx.projectAgentsDir}` : ""}.`,
					severity: "info",
					path: ctx.projectAgentsDir,
				},
			],
		};
	}
	return denyProjectAgents(library, {
		code: "project-agents-confirm-denied",
		message: "Project library source was denied by confirmation.",
		severity: "info",
	}, ctx.projectAgentsDir);
}

function denyProjectAgents(
	library: LibraryOptions,
	diagnostic: { code: string; message: string; severity: AgentDiagnostic["severity"] },
	projectAgentsDir: string | undefined,
): { library: LibraryOptions; diagnostics: AgentDiagnostic[] } {
	return {
		library: { ...library, sources: library.sources.filter((source) => source !== "project"), projectAgents: "deny" },
		diagnostics: [{ ...diagnostic, path: projectAgentsDir }],
	};
}
