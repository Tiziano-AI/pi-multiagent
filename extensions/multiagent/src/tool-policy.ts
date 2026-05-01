/** Child tool and extension grant policy for isolated subagents. */

import { lstatSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type {
	AgentDiagnostic,
	CatalogExtensionToolSummary,
	ExtensionToolGrantSpec,
	ExtensionToolPolicy,
	ParentToolInfo,
	ParentToolInventory,
	ParentToolSourceInfo,
	ResolvedExtensionSource,
	ResolvedExtensionToolGrant,
} from "./types.ts";
import { BUILTIN_CHILD_TOOL_NAMES, TOOL_NAME_PATTERN } from "./types.ts";
import { readExtensionSource, sameResolvedExtensionSource, sameSourceState } from "./extension-source.ts";

const TOOL_NAME_REGEX = new RegExp(TOOL_NAME_PATTERN);
const CHILD_TOOL_NAMES = new Set<string>(BUILTIN_CHILD_TOOL_NAMES);
const RESERVED_EXTENSION_TOOL_NAMES = new Set<string>([...BUILTIN_CHILD_TOOL_NAMES, "agent_team"]);
const MAX_CHILD_TOOL_NAMES = 24;

export interface ToolResolutionContext {
	parentTools: ParentToolInventory;
	extensionToolPolicy: ExtensionToolPolicy;
	cwd: string;
}

export interface ResolvedAgentToolAccess {
	tools: string[];
	extensionTools: ResolvedExtensionToolGrant[];
}

export function normalizeExtensionToolPolicy(input: Partial<ExtensionToolPolicy> | undefined): ExtensionToolPolicy {
	return {
		projectExtensions: input?.projectExtensions ?? "deny",
		localExtensions: input?.localExtensions ?? "deny",
	};
}

export function hasExtensionToolGrants(input: { agents?: { extensionTools?: ExtensionToolGrantSpec[] }[] } | undefined): boolean {
	return input?.agents?.some((agent) => (agent.extensionTools?.length ?? 0) > 0) ?? false;
}

export function hasReadTool(tools: string[]): boolean {
	return tools.includes("read");
}

export function childToolNames(agent: { tools: string[]; extensionTools: { name: string }[] }): string[] {
	return dedupeStrings([...agent.tools, ...agent.extensionTools.map((tool) => tool.name)]);
}

export function catalogParentExtensionTools(inventory: ParentToolInventory | undefined): CatalogExtensionToolSummary[] {
	if (!inventory?.apiAvailable) return [];
	const activeNameCounts = countActiveToolNames(inventory.tools);
	return inventory.tools
		.filter((tool) => tool.active && activeNameCounts.get(tool.name) === 1 && tool.sourceInfo.source !== "builtin" && tool.sourceInfo.source !== "sdk" && !RESERVED_EXTENSION_TOOL_NAMES.has(tool.name))
		.map((tool) => ({
			name: tool.name,
			description: tool.description,
			from: { source: tool.sourceInfo.source, scope: tool.sourceInfo.scope, origin: tool.sourceInfo.origin },
			active: tool.active,
		}))
		.sort((left, right) => left.name.localeCompare(right.name) || left.from.source.localeCompare(right.from.source));
}

function countActiveToolNames(tools: ParentToolInfo[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const tool of tools) {
		if (tool.active) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
	}
	return counts;
}

export function validateToolNames(tools: string[] | undefined, label: string, diagnostics: AgentDiagnostic[], path: string, severity: AgentDiagnostic["severity"] = "error"): boolean {
	return validateBuiltinToolNames(tools, label, diagnostics, path, severity);
}

export function validateBuiltinToolNames(tools: string[] | undefined, label: string, diagnostics: AgentDiagnostic[], path: string, severity: AgentDiagnostic["severity"] = "error"): boolean {
	if (!tools) return true;
	if (tools.length > MAX_CHILD_TOOL_NAMES) {
		diagnostics.push({ code: "agent-tools-too-many", message: `${label} declares too many built-in tools; maximum is ${MAX_CHILD_TOOL_NAMES}.`, path, severity });
		return false;
	}
	const invalid = tools.filter((tool) => !TOOL_NAME_REGEX.test(tool) || !CHILD_TOOL_NAMES.has(tool));
	if (invalid.length === 0) return true;
	diagnostics.push({
		code: "agent-tool-invalid",
		message: `${label} has unavailable built-in tool names: ${invalid.join(", ")}. Built-in child tools under isolation are limited to ${BUILTIN_CHILD_TOOL_NAMES.join(", ")}. Extension tools such as exa_search must use extensionTools[].`,
		path,
		severity,
	});
	return false;
}

export function resolveAgentToolAccess(input: {
	tools: string[] | undefined;
	extensionTools: ExtensionToolGrantSpec[] | undefined;
	label: string;
	toolsPath: string;
	extensionToolsPath: string;
	diagnostics: AgentDiagnostic[];
	context: ToolResolutionContext | undefined;
}): ResolvedAgentToolAccess | undefined {
	const tools = input.tools ?? [];
	if (!validateBuiltinToolNames(input.tools, input.label, input.diagnostics, input.toolsPath)) return undefined;
	const extensionTools = resolveExtensionToolGrants(input.extensionTools, input.label, input.diagnostics, input.extensionToolsPath, input.context);
	if (!extensionTools) return undefined;
	const childTools = childToolNames({ tools, extensionTools });
	if (childTools.length > MAX_CHILD_TOOL_NAMES) {
		input.diagnostics.push({
			code: "agent-tools-too-many",
			message: `${input.label} resolves ${childTools.length} child tools; maximum is ${MAX_CHILD_TOOL_NAMES} across built-in tools and extensionTools[].`,
			path: input.extensionToolsPath,
			severity: "error",
		});
		return undefined;
	}
	return { tools, extensionTools };
}

export function verifyResolvedExtensionSources(grants: ResolvedExtensionToolGrant[]): string | undefined {
	const checked = new Set<string>();
	for (const grant of grants) {
		if (checked.has(grant.source.realpath)) continue;
		checked.add(grant.source.realpath);
		const current = readExtensionSource(grant.source.path);
		if (current.error) return `Extension tool source changed before launch for ${grant.name}: ${current.error}`;
		if (!sameSourceState(grant.source, current.source)) return `Extension tool source changed before launch for ${grant.name}; refusing to load stale extension code.`;
	}
	return undefined;
}

function resolveExtensionToolGrants(grants: ExtensionToolGrantSpec[] | undefined, label: string, diagnostics: AgentDiagnostic[], path: string, context: ToolResolutionContext | undefined): ResolvedExtensionToolGrant[] | undefined {
	if (!grants || grants.length === 0) return [];
	if (grants.length > MAX_CHILD_TOOL_NAMES) {
		diagnostics.push({ code: "extension-tools-too-many", message: `${label} declares too many extensionTools; maximum is ${MAX_CHILD_TOOL_NAMES}.`, path, severity: "error" });
		return undefined;
	}
	if (!context || !context.parentTools.apiAvailable) {
		diagnostics.push({
			code: "extension-tool-inventory-unavailable",
			message: context?.parentTools.errorMessage ? `Cannot resolve extensionTools for ${label}: ${context.parentTools.errorMessage}` : `Cannot resolve extensionTools for ${label}: parent Pi tool inventory is unavailable.`,
			path,
			severity: "error",
		});
		return undefined;
	}
	const resolved: ResolvedExtensionToolGrant[] = [];
	const seenNames = new Set<string>();
	for (const [index, grant] of grants.entries()) {
		const grantPath = `${path}/${index}`;
		const resolvedGrant = resolveExtensionToolGrant(grant, label, diagnostics, grantPath, context, seenNames);
		if (resolvedGrant) resolved.push(resolvedGrant);
	}
	return diagnostics.some((item) => item.severity === "error" && item.path?.startsWith(path)) ? undefined : resolved;
}

function resolveExtensionToolGrant(
	grant: ExtensionToolGrantSpec,
	label: string,
	diagnostics: AgentDiagnostic[],
	path: string,
	context: ToolResolutionContext,
	seenNames: Set<string>,
): ResolvedExtensionToolGrant | undefined {
	if (!TOOL_NAME_REGEX.test(grant.name)) {
		diagnostics.push({ code: "extension-tool-name-invalid", message: `${label} has invalid extension tool name: ${grant.name}.`, path: `${path}/name`, severity: "error" });
		return undefined;
	}
	if (seenNames.has(grant.name)) {
		diagnostics.push({ code: "extension-tool-duplicate", message: `${label} grants extension tool ${grant.name} more than once.`, path: `${path}/name`, severity: "error" });
		return undefined;
	}
	seenNames.add(grant.name);
	if (RESERVED_EXTENSION_TOOL_NAMES.has(grant.name)) {
		diagnostics.push({ code: "extension-tool-reserved", message: `${label} cannot grant reserved extension tool ${grant.name}. Built-ins stay in tools[], and nested agent_team is denied.`, path: `${path}/name`, severity: "error" });
		return undefined;
	}
	const candidates = context.parentTools.tools.filter((tool) => tool.name === grant.name);
	if (candidates.length === 0) {
		diagnostics.push({ code: "extension-tool-unavailable", message: `${label} requests extension tool ${grant.name}, but the parent runtime has no tool with that name.`, path: `${path}/name`, severity: "error" });
		return undefined;
	}
	const active = candidates.filter((tool) => tool.active);
	if (active.length === 0) {
		diagnostics.push({ code: "extension-tool-inactive", message: `${label} requests extension tool ${grant.name}, but the parent runtime tool is not active.`, path: `${path}/name`, severity: "error" });
		return undefined;
	}
	if (active.length > 1) {
		diagnostics.push({ code: "extension-tool-active-ambiguous", message: `${label} requests extension tool ${grant.name}, but multiple parent tools with that name appear active and Pi reports active tools by name only. Disable duplicate tool names before delegating.`, path: `${path}/name`, severity: "error" });
		return undefined;
	}
	const matching = active.filter((candidate) => matchesRequestedProvenance(candidate.sourceInfo, grant.from));
	if (matching.length === 0) {
		diagnostics.push({ code: "extension-tool-source-mismatch", message: `${label} requests ${grant.name} from ${grant.from.source}, but no active parent tool with that name matches the requested provenance.`, path: `${path}/from`, severity: "error" });
		return undefined;
	}
	if (matching.length > 1) {
		diagnostics.push({ code: "extension-tool-source-ambiguous", message: `${label} requests ${grant.name} from ${grant.from.source}, but multiple active parent tools match that provenance. Disable duplicate extension registrations before delegating.`, path: `${path}/from`, severity: "error" });
		return undefined;
	}
	const tool = matching[0];
	if (tool.sourceInfo.source === "builtin") {
		diagnostics.push({ code: "extension-tool-builtin-denied", message: `${label} requests built-in tool ${grant.name} through extensionTools[]; use tools[] instead.`, path: `${path}/name`, severity: "error" });
		return undefined;
	}
	if (tool.sourceInfo.source === "sdk") {
		diagnostics.push({ code: "extension-tool-sdk-unloadable", message: `${label} requests SDK tool ${grant.name}; SDK tools cannot be reloaded into isolated child Pi processes through --extension.`, path: `${path}/name`, severity: "error" });
		return undefined;
	}
	const source = readExtensionSource(tool.sourceInfo.path);
	if (source.error) {
		diagnostics.push({ code: "extension-tool-source-unloadable", message: `${label} requests ${grant.name}, but its parent source is not child-loadable: ${source.error}`, path, severity: "error" });
		return undefined;
	}
	const policyDiagnostic = validateSourcePolicy(source.source, tool.sourceInfo, context, grant.name, path);
	if (policyDiagnostic) {
		diagnostics.push(policyDiagnostic);
		return undefined;
	}
	const reservedTool = findReservedSourceCollision(context.parentTools.tools, tool.sourceInfo, source.source);
	if (reservedTool) {
		diagnostics.push({
			code: reservedTool.name === "agent_team" ? "extension-tool-recursion-denied" : "extension-tool-builtin-collision",
			message: `${label} cannot load source ${tool.sourceInfo.source} for ${grant.name}; the same source also registers reserved tool ${reservedTool.name}.`,
			path,
			severity: "error",
		});
		return undefined;
	}
	return { name: grant.name, description: tool.description, source: { ...source.source, source: tool.sourceInfo.source, scope: tool.sourceInfo.scope, origin: tool.sourceInfo.origin, baseDir: tool.sourceInfo.baseDir } };
}

function matchesRequestedProvenance(sourceInfo: ParentToolSourceInfo, expected: ExtensionToolGrantSpec["from"]): boolean {
	return sourceInfo.source === expected.source && (expected.scope === undefined || sourceInfo.scope === expected.scope) && (expected.origin === undefined || sourceInfo.origin === expected.origin);
}

function validateSourcePolicy(source: ResolvedExtensionSource, sourceInfo: ParentToolSourceInfo, context: ToolResolutionContext, name: string, path: string): AgentDiagnostic | undefined {
	if (sourceInfo.scope === "project") return policyDiagnostic(context.extensionToolPolicy.projectExtensions, "extension-tool-project", name, path, "project-scoped extension tools are repository-controlled");
	if (sourceInfo.scope === "temporary" || isWorkspaceLocalSource(source.realpath, context.cwd)) return policyDiagnostic(context.extensionToolPolicy.localExtensions, "extension-tool-local", name, path, "temporary or current-workspace local extension tools are local code execution");
	return undefined;
}

function policyDiagnostic(policy: ExtensionToolPolicy["projectExtensions"], codePrefix: string, name: string, path: string, reason: string): AgentDiagnostic | undefined {
	if (policy === "allow") return undefined;
	const code = policy === "confirm" ? `${codePrefix}-confirm-unprepared` : `${codePrefix}-denied`;
	const action = policy === "confirm" ? "requires UI confirmation before planning" : "is denied by default";
	return { code, message: `Extension tool ${name} ${action}; ${reason}.`, path, severity: "error" };
}

function findReservedSourceCollision(tools: ParentToolInfo[], selected: ParentToolSourceInfo, selectedSource: ResolvedExtensionSource): ParentToolInfo | undefined {
	for (const candidate of tools) {
		if (!RESERVED_EXTENSION_TOOL_NAMES.has(candidate.name)) continue;
		if (sameParentSource(candidate.sourceInfo, selected)) return candidate;
		const source = readExtensionSource(candidate.sourceInfo.path);
		if (!source.error && sameResolvedExtensionSource(selectedSource, source.source)) return candidate;
	}
	return undefined;
}

function sameParentSource(left: ParentToolSourceInfo, right: ParentToolSourceInfo): boolean {
	return left.path === right.path && left.source === right.source && left.scope === right.scope && left.origin === right.origin && left.baseDir === right.baseDir;
}

function isWorkspaceLocalSource(realpath: string, cwd: string): boolean {
	const root = findWorkspaceRoot(cwd);
	const realRoot = safeRealpath(root);
	return isContainedPath(root, realpath) || (realRoot !== undefined && isContainedPath(realRoot, realpath));
}

function findWorkspaceRoot(cwd: string): string {
	let current = resolve(cwd);
	while (true) {
		if (pathExists(join(current, ".git")) || pathExists(join(current, ".pi"))) return current;
		const parent = dirname(current);
		if (parent === current) return resolve(cwd);
		current = parent;
	}
}

function pathExists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

function safeRealpath(path: string): string | undefined {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

function isContainedPath(parent: string, child: string): boolean {
	const normalizedParent = resolve(parent);
	const normalizedChild = resolve(child);
	const prefix = normalizedParent.endsWith(sep) ? normalizedParent : `${normalizedParent}${sep}`;
	return normalizedChild === normalizedParent || normalizedChild.startsWith(prefix);
}

function dedupeStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}
