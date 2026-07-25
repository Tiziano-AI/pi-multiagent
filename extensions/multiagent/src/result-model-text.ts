import type { RunSnapshot, StepUsage } from "./types.ts";

export function fmtTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatRunTeamCost(teamUsage: RunSnapshot["teamUsage"]): string | undefined {
	if (!teamUsage) return undefined;
	return `Team cost: $${teamUsage.cost.toFixed(4)} tokens: \u2191${fmtTokens(teamUsage.input)} \u2193${fmtTokens(teamUsage.output)} R${fmtTokens(teamUsage.cacheRead)} W${fmtTokens(teamUsage.cacheWrite)}`;
}

export function formatStepCost(usage: StepUsage | undefined): string {
	return usage ? ` cost=$${usage.cost.toFixed(4)}` : "";
}

export function modelText(text: string): string {
	return escapeOutputBlockMarkers(text).replace(/\s+/g, " ").trim();
}

export function boundedModelText(text: string, maxChars: number): string {
	const normalized = modelText(text);
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, maxChars)}... [truncated ${normalized.length - maxChars} chars]`;
}

export function escapeOutputBlockMarkers(output: string): string {
	return output.replace(/(^|\r\n|\n|\r|\u2028|\u2029)(\[agent_team output (?:begin|end):)/g, "$1\\$2");
}
