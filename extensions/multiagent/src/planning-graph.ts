/** Dependency graph validation for agent_team run plans. */

import type { AgentDiagnostic, ResolvedAgent, TeamStepSpec } from "./types.ts";

export function validateSteps(steps: TeamStepSpec[], agents: ResolvedAgent[], diagnostics: AgentDiagnostic[]): void {
	const agentById = new Map(agents.map((agent) => [agent.id, agent]));
	const synthesisIds = new Set(steps.filter((step) => step.synthesis).map((step) => step.id));
	const stepIds = new Set<string>();
	for (let index = 0; index < steps.length; index += 1) {
		const step = steps[index];
		const stepPath = step.synthesis ? "/synthesis" : `/steps/${index}`;
		if (stepIds.has(step.id)) diagnostics.push(makeDiagnostic("step-id-duplicate", `Duplicate step id: ${step.id}.`, "error", `${stepPath}/id`));
		stepIds.add(step.id);
		const agent = agentById.get(step.agent);
		if (!agent) diagnostics.push(makeDiagnostic("step-agent-unknown", `Step ${step.id} references unknown agent ${step.agent}. Define it in agents[], use a source-qualified library ref, run action:"catalog", or adjust library.sources/projectAgents.`, "error", `${stepPath}/agent`));
		for (const need of step.needs) {
			if (need === step.id) diagnostics.push(makeDiagnostic("step-self-dependency", `Step ${step.id} depends on itself.`, "error", `${stepPath}/needs`));
			if (!step.synthesis && synthesisIds.has(need)) diagnostics.push(makeDiagnostic("synthesis-must-be-terminal", `Step ${step.id} depends on synthesis step ${need}; synthesis is terminal fan-in and cannot be used as an intermediate dependency.`, "error", `${stepPath}/needs`));
			if (!steps.some((candidate) => candidate.id === need)) diagnostics.push(makeDiagnostic("step-dependency-unknown", `Step ${step.id} depends on unknown step ${need}.`, "error", `${stepPath}/needs`));
		}
	}
	for (const cycle of findCycles(steps)) diagnostics.push(makeDiagnostic("step-cycle", `Dependency cycle: ${cycle.join(" -> ")}.`, "error", "/steps"));
}

function findCycles(steps: TeamStepSpec[]): string[][] {
	const byId = new Map(steps.map((step) => [step.id, step]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const cycles: string[][] = [];
	const cycleKeys = new Set<string>();
	const visit = (id: string, path: string[]) => {
		if (visiting.has(id)) {
			const cycle = path.slice(path.indexOf(id));
			if (cycle[cycle.length - 1] !== id) cycle.push(id);
			const key = cycle.join("\u0000");
			if (!cycleKeys.has(key)) {
				cycleKeys.add(key);
				cycles.push(cycle);
			}
			return;
		}
		if (visited.has(id)) return;
		visiting.add(id);
		const step = byId.get(id);
		for (const need of step?.needs ?? []) visit(need, [...path, need]);
		visiting.delete(id);
		visited.add(id);
	};
	for (const step of steps) visit(step.id, [step.id]);
	return cycles;
}

function makeDiagnostic(code: string, message: string, severity: AgentDiagnostic["severity"], path?: string): AgentDiagnostic {
	return { code, message, severity, path };
}
