/** Child tool allowlist policy for isolated subagents. */

import type { AgentDiagnostic } from "./types.ts";
import { TOOL_NAME_PATTERN } from "./types.ts";

const TOOL_NAME_REGEX = new RegExp(TOOL_NAME_PATTERN);
const CHILD_TOOL_NAMES = new Set(["read", "grep", "find", "ls", "bash", "edit", "write"]);

export function hasReadTool(tools: string[]): boolean {
	return tools.includes("read");
}

export function validateToolNames(tools: string[] | undefined, label: string, diagnostics: AgentDiagnostic[], path: string, severity: AgentDiagnostic["severity"] = "error"): boolean {
	if (!tools) return true;
	if (tools.length > 24) {
		diagnostics.push({ code: "agent-tools-too-many", message: `${label} declares too many tools; maximum is 24.`, path, severity });
		return false;
	}
	const invalid = tools.filter((tool) => !TOOL_NAME_REGEX.test(tool) || !CHILD_TOOL_NAMES.has(tool));
	if (invalid.length === 0) return true;
	diagnostics.push({
		code: "agent-tool-invalid",
		message: `${label} has unavailable tool names: ${invalid.join(", ")}. Child tools under isolation are limited to read, grep, find, ls, bash, edit, and write.`,
		path,
		severity,
	});
	return false;
}
