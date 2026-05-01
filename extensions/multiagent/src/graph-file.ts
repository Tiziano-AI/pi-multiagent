/** Graph-file ingress for agent_team run calls. */

import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { Compile } from "typebox/compile";
import { AgentTeamSchema, type AgentTeamInput } from "./schemas.ts";
import type { AgentDiagnostic } from "./types.ts";
import { MAX_GRAPH_FILE_BYTES } from "./types.ts";

const GRAPH_FILE_EXTENSION = ".json";
const validateAgentTeamInput = Compile(AgentTeamSchema);

export interface MaterializedAgentTeamInput {
	input: AgentTeamInput;
	diagnostics: AgentDiagnostic[];
}

export function materializeAgentTeamInput(input: AgentTeamInput, cwd: string): MaterializedAgentTeamInput {
	if (input.graphFile === undefined) return { input, diagnostics: [] };
	const diagnostics = validateGraphFileWrapper(input);
	if (diagnostics.some((item) => item.severity === "error")) return { input, diagnostics };
	const resolved = resolveGraphFile(input.graphFile, cwd);
	if (resolved.diagnostic) return { input, diagnostics: [...diagnostics, resolved.diagnostic] };
	const loaded = readGraphFile(resolved.path ?? "");
	if (loaded.diagnostics.length > 0) return { input, diagnostics: [...diagnostics, ...loaded.diagnostics] };
	return { input: loaded.input ?? input, diagnostics };
}

function validateGraphFileWrapper(input: AgentTeamInput): AgentDiagnostic[] {
	const diagnostics: AgentDiagnostic[] = [];
	if (input.action !== "run") diagnostics.push(makeDiagnostic("graph-file-run-only", "graphFile is valid only with action:\"run\".", "/graphFile"));
	if (!input.graphFile.trim()) diagnostics.push(makeDiagnostic("graph-file-required", "graphFile must be a non-empty relative JSON path.", "/graphFile"));
	const forbidden: string[] = [];
	if (input.objective !== undefined) forbidden.push("objective");
	if (input.library !== undefined) forbidden.push("library");
	if (input.agents !== undefined) forbidden.push("agents");
	if (input.steps !== undefined) forbidden.push("steps");
	if (input.synthesis !== undefined) forbidden.push("synthesis");
	if (input.limits !== undefined) forbidden.push("limits");
	if (input.extensionToolPolicy !== undefined) forbidden.push("extensionToolPolicy");
	if (forbidden.length > 0) diagnostics.push(makeDiagnostic("graph-file-inline-fields-denied", `graphFile loads the complete run graph; remove inline fields: ${forbidden.join(", ")}.`, "/"));
	return diagnostics;
}

function resolveGraphFile(path: string, cwd: string): { path?: string; diagnostic?: AgentDiagnostic } {
	if (path.includes("\0")) return { diagnostic: makeDiagnostic("graph-file-path-invalid", "graphFile path contains a NUL byte.", "/graphFile") };
	if (isAbsolute(path)) return { diagnostic: makeDiagnostic("graph-file-absolute-denied", "graphFile must be relative to the current working directory.", "/graphFile") };
	if (!path.endsWith(GRAPH_FILE_EXTENSION)) return { diagnostic: makeDiagnostic("graph-file-extension-invalid", "graphFile must point to a .json file.", "/graphFile") };
	let realCwd: string;
	let realPath: string;
	const lexicalPath = resolve(cwd, path);
	try {
		realCwd = realpathSync(cwd);
	} catch (error) {
		return { diagnostic: makeDiagnostic("graph-file-cwd-invalid", `Could not resolve cwd for graphFile: ${errorMessage(error)}`, "/graphFile") };
	}
	try {
		const stats = lstatSync(lexicalPath);
		if (stats.isSymbolicLink()) return { diagnostic: makeDiagnostic("graph-file-symlink-denied", "graphFile symlinks are denied; use a regular JSON file inside the current workspace.", "/graphFile") };
		if (!stats.isFile()) return { diagnostic: makeDiagnostic("graph-file-not-file", "graphFile must point to a regular JSON file.", "/graphFile") };
		realPath = realpathSync(lexicalPath);
	} catch (error) {
		return { diagnostic: makeDiagnostic("graph-file-unreadable", `Could not access graphFile: ${errorMessage(error)}`, "/graphFile") };
	}
	if (!isContainedPath(realCwd, realPath)) return { diagnostic: makeDiagnostic("graph-file-path-escape-denied", "graphFile must resolve inside the current working directory.", "/graphFile") };
	try {
		const stats = statSync(realPath);
		if (stats.size > MAX_GRAPH_FILE_BYTES) return { diagnostic: makeDiagnostic("graph-file-too-large", `graphFile exceeds ${MAX_GRAPH_FILE_BYTES} bytes.`, "/graphFile") };
	} catch (error) {
		return { diagnostic: makeDiagnostic("graph-file-stat-failed", `Could not inspect graphFile: ${errorMessage(error)}`, "/graphFile") };
	}
	return { path: realPath };
}

function readGraphFile(path: string): { input?: AgentTeamInput; diagnostics: AgentDiagnostic[] } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		return { diagnostics: [makeDiagnostic("graph-file-json-invalid", `Could not parse graphFile JSON: ${errorMessage(error)}`, "/graphFile")] };
	}
	if (!isRecord(parsed)) return { diagnostics: [makeDiagnostic("graph-file-object-required", "graphFile JSON must be an object.", "/graphFile")] };
	if (parsed.action !== "run") return { diagnostics: [makeDiagnostic("graph-file-action-invalid", "graphFile JSON must contain action:\"run\".", "/graphFile/action")] };
	if (parsed.graphFile !== undefined) return { diagnostics: [makeDiagnostic("graph-file-nested-denied", "Nested graphFile is denied.", "/graphFile/graphFile")] };
	const schemaDiagnostics = validateGraphSchema(parsed);
	if (schemaDiagnostics.length > 0) return { diagnostics: schemaDiagnostics };
	return { input: parsed as AgentTeamInput, diagnostics: [] };
}

function validateGraphSchema(value: Record<string, unknown>): AgentDiagnostic[] {
	if (validateAgentTeamInput.Check(value)) return [];
	return [...validateAgentTeamInput.Errors(value)].map((error) => makeDiagnostic("graph-file-schema-invalid", `graphFile schema violation: ${error.message}`, `/graphFile${error.instancePath}`));
}

function makeDiagnostic(code: string, message: string, path: string): AgentDiagnostic {
	return { code, message, path, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isContainedPath(parent: string, child: string): boolean {
	const normalizedParent = resolve(parent);
	const normalizedChild = resolve(child);
	return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
