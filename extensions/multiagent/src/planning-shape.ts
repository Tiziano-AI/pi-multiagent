/** Preflight shape checks for agent_team calls before graph resolution. */

import type { AgentTeamInput } from "./schemas.ts";
import type { AgentDiagnostic } from "./types.ts";

export function validateActionShape(input: AgentTeamInput): AgentDiagnostic[] {
	if (input.action !== "catalog") return [];
	const forbidden: string[] = [];
	if (input.graphFile !== undefined) forbidden.push("graphFile");
	if (input.objective !== undefined) forbidden.push("objective");
	if (input.agents !== undefined) forbidden.push("agents");
	if (input.steps !== undefined) forbidden.push("steps");
	if (input.synthesis !== undefined) forbidden.push("synthesis");
	if (input.limits !== undefined) forbidden.push("limits");
	if (input.extensionToolPolicy !== undefined) forbidden.push("extensionToolPolicy");
	if (input.callerSkills !== undefined) forbidden.push("callerSkills");
	if (forbidden.length === 0) return [];
	return [makeDiagnostic("catalog-run-fields-denied", `Catalog action rejects run-only fields: ${forbidden.join(", ")}.`, "error", "/")];
}

export function validatePreflightShape(input: AgentTeamInput): AgentDiagnostic[] {
	if (input.action !== "catalog" && input.action !== "run") return [makeDiagnostic("action-required", 'agent_team requires action:"run" or action:"catalog".', "error", "/action")];
	const diagnostics = validateActionShape(input);
	if (input.action !== "run") return diagnostics;
	if (input.graphFile !== undefined) {
		const forbidden: string[] = [];
		if (input.objective !== undefined) forbidden.push("objective");
		if (input.library !== undefined) forbidden.push("library");
		if (input.agents !== undefined) forbidden.push("agents");
		if (input.steps !== undefined) forbidden.push("steps");
		if (input.synthesis !== undefined) forbidden.push("synthesis");
		if (input.limits !== undefined) forbidden.push("limits");
		if (input.extensionToolPolicy !== undefined) forbidden.push("extensionToolPolicy");
		if (input.callerSkills !== undefined) forbidden.push("callerSkills");
		if (forbidden.length > 0) diagnostics.push(makeDiagnostic("graph-file-inline-fields-denied", `graphFile loads the complete run graph; remove inline fields: ${forbidden.join(", ")}.`, "error", "/"));
		return diagnostics;
	}
	if (!input.objective?.trim()) diagnostics.push(makeDiagnostic("objective-required", "Run action requires objective.", "error", "/objective"));
	if (!input.steps || input.steps.length === 0) diagnostics.push(makeDiagnostic("steps-required", "Run action requires at least one step.", "error", "/steps"));
	if (input.library?.query !== undefined) diagnostics.push(makeDiagnostic("run-library-query-denied", "Run action rejects catalog-only library.query; use catalog to search or omit query for execution.", "error", "/library/query"));
	return diagnostics;
}

function makeDiagnostic(code: string, message: string, severity: AgentDiagnostic["severity"], path?: string): AgentDiagnostic {
	return { code, message, severity, path };
}
