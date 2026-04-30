import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { discoverAgents, normalizeLibraryOptions } from "../extensions/multiagent/src/agents.ts";
import { resolveRunPlan, validatePreflightShape } from "../extensions/multiagent/src/planning.ts";
import { AgentTeamSchema, type AgentTeamInput } from "../extensions/multiagent/src/schemas.ts";
import type { LibrarySource, ProjectAgentsPolicy } from "../extensions/multiagent/src/types.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesRoot = join(packageRoot, "examples", "graphs");
const librarySourceValues = new Set<LibrarySource>(["package", "user", "project"]);
const projectPolicyValues = new Set<ProjectAgentsPolicy>(["deny", "confirm", "allow"]);

interface JsonSchemaRecord {
	type?: unknown;
	required?: unknown;
	properties?: unknown;
	additionalProperties?: unknown;
	items?: unknown;
	enum?: unknown;
	minLength?: unknown;
	maxLength?: unknown;
	minItems?: unknown;
	maxItems?: unknown;
	minimum?: unknown;
	maximum?: unknown;
	multipleOf?: unknown;
	pattern?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function schemaRecord(value: unknown): JsonSchemaRecord {
	return isRecord(value) ? value : {};
}

function schemaErrors(value: unknown, schemaValue: unknown, path: string): string[] {
	const schema = schemaRecord(schemaValue);
	const errors: string[] = [];
	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${path}: expected enum ${JSON.stringify(schema.enum)}`);
	if (schema.type === "object") {
		if (!isRecord(value)) return [`${path}: expected object`];
		if (Array.isArray(schema.required)) {
			for (const required of schema.required) {
				if (typeof required === "string" && value[required] === undefined) errors.push(`${path}/${required}: required`);
			}
		}
		const properties = isRecord(schema.properties) ? schema.properties : {};
		if (schema.additionalProperties === false) {
			for (const key of Object.keys(value)) {
				if (properties[key] === undefined) errors.push(`${path}/${key}: additional property denied`);
			}
		}
		for (const [key, childSchema] of Object.entries(properties)) {
			if (value[key] !== undefined) errors.push(...schemaErrors(value[key], childSchema, `${path}/${key}`));
		}
		return errors;
	}
	if (schema.type === "array") {
		if (!Array.isArray(value)) return [`${path}: expected array`];
		if (typeof schema.minItems === "number" && value.length < schema.minItems) errors.push(`${path}: expected at least ${schema.minItems} items`);
		if (typeof schema.maxItems === "number" && value.length > schema.maxItems) errors.push(`${path}: expected at most ${schema.maxItems} items`);
		for (const [index, item] of value.entries()) errors.push(...schemaErrors(item, schema.items, `${path}/${index}`));
		return errors;
	}
	if (schema.type === "string") {
		if (typeof value !== "string") return [`${path}: expected string`];
		if (typeof schema.minLength === "number" && value.length < schema.minLength) errors.push(`${path}: expected at least ${schema.minLength} chars`);
		if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errors.push(`${path}: expected at most ${schema.maxLength} chars`);
		if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
		return errors;
	}
	if (schema.type === "number") {
		if (typeof value !== "number") return [`${path}: expected number`];
		if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${path}: expected >= ${schema.minimum}`);
		if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${path}: expected <= ${schema.maximum}`);
		if (typeof schema.multipleOf === "number" && value % schema.multipleOf !== 0) errors.push(`${path}: expected multiple of ${schema.multipleOf}`);
		return errors;
	}
	if (schema.type === "boolean" && typeof value !== "boolean") errors.push(`${path}: expected boolean`);
	return errors;
}

function isAgentTeamInput(value: unknown): value is AgentTeamInput {
	if (!isRecord(value)) return false;
	return value.action === "catalog" || value.action === "run";
}

function readLibrarySettings(input: AgentTeamInput): { sources: LibrarySource[]; projectAgents: ProjectAgentsPolicy } {
	const library = isRecord(input.library) ? input.library : {};
	const rawSources = isStringArray(library.sources) ? library.sources : ["package", "user"];
	const sources = rawSources.filter((source): source is LibrarySource => librarySourceValues.has(source as LibrarySource));
	const rawPolicy = library.projectAgents;
	return {
		sources: sources.length > 0 ? sources : ["package", "user"],
		projectAgents: typeof rawPolicy === "string" && projectPolicyValues.has(rawPolicy as ProjectAgentsPolicy) ? rawPolicy as ProjectAgentsPolicy : "deny",
	};
}

test("graph cookbook examples are valid run plans", async () => {
	const files = (await readdir(examplesRoot)).filter((file) => file.endsWith(".json")).sort();
	assert.deepEqual(files, ["public-release-foundry.json", "research-to-change-gated-loop.json"]);
	for (const file of files) {
		const raw = JSON.parse(await readFile(join(examplesRoot, file), "utf8"));
		const schemaFailures = schemaErrors(raw, AgentTeamSchema, "");
		assert.equal(schemaFailures.length, 0, `${file} schema errors: ${schemaFailures.join("; ")}`);
		assert.equal(isAgentTeamInput(raw), true, `${file} must be an agent_team input object`);
		if (!isAgentTeamInput(raw)) continue;
		assert.equal(raw.action, "run", `${file} must be a run example`);
		const library = readLibrarySettings(raw);
		const discovery = discoverAgents({
			cwd: packageRoot,
			packageAgentsDir: join(packageRoot, "agents"),
			library: normalizeLibraryOptions(library),
			userAgentsDir: join(packageRoot, ".example-user-agents"),
			globalPiDir: join(packageRoot, ".example-pi"),
		});
		assert.equal(discovery.diagnostics.filter((item) => item.severity === "error").length, 0, `${file} discovery errors: ${JSON.stringify(discovery.diagnostics)}`);
		const preflight = validatePreflightShape(raw);
		assert.equal(preflight.filter((item) => item.severity === "error").length, 0, `${file} preflight errors: ${JSON.stringify(preflight)}`);
		const plan = resolveRunPlan(raw, discovery.agents, []);
		assert.equal(plan.diagnostics.filter((item) => item.severity === "error").length, 0, `${file} plan errors: ${JSON.stringify(plan.diagnostics)}`);
		assert.equal(plan.steps.some((step) => step.synthesis), true, `${file} must include terminal synthesis`);
		assert.equal(plan.steps.filter((step) => step.agent === "package:worker").every((step) => step.needs.length > 0), true, `${file} worker steps must be dependency-gated`);
	}
});
