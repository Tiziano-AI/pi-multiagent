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

async function readExampleInput(file: string): Promise<AgentTeamInput> {
	const raw: unknown = JSON.parse(await readFile(join(examplesRoot, file), "utf8"));
	if (!isAgentTeamInput(raw)) throw new Error(`${file} must be an agent_team input object`);
	return raw;
}

async function readMarkdownSectionAgentTeamBlocks(file: string, heading: string): Promise<AgentTeamInput[]> {
	const text = await readFile(join(packageRoot, file), "utf8");
	const headingMarker = `## ${heading}`;
	const start = text.indexOf(headingMarker);
	if (start < 0) throw new Error(`${file} missing section ${headingMarker}`);
	const afterStart = text.slice(start + headingMarker.length);
	const nextHeading = afterStart.indexOf("\n## ");
	const section = nextHeading < 0 ? afterStart : afterStart.slice(0, nextHeading);
	const inputs: AgentTeamInput[] = [];
	const blockPattern = /```json\n([\s\S]*?)\n```/g;
	for (const match of section.matchAll(blockPattern)) {
		const raw: unknown = JSON.parse(match[1]);
		if (!isAgentTeamInput(raw)) throw new Error(`${file} ${headingMarker} JSON block must be an agent_team input object`);
		inputs.push(raw);
	}
	return inputs;
}

function requireStep(input: AgentTeamInput, id: string): NonNullable<AgentTeamInput["steps"]>[number] {
	const step = (input.steps ?? []).find((candidate) => candidate.id === id);
	if (!step) throw new Error(`Missing step ${id}`);
	return step;
}

function requireAgent(input: AgentTeamInput, id: string): NonNullable<AgentTeamInput["agents"]>[number] {
	const agent = (input.agents ?? []).find((candidate) => candidate.id === id);
	if (!agent) throw new Error(`Missing agent ${id}`);
	return agent;
}

function requireSynthesis(input: AgentTeamInput): NonNullable<AgentTeamInput["synthesis"]> {
	if (!input.synthesis) throw new Error("Missing synthesis");
	return input.synthesis;
}

function assertTextIncludes(value: string | undefined, fragment: string, label: string): void {
	assert.equal(value?.includes(fragment), true, `${label} must include ${JSON.stringify(fragment)}`);
}

function assertAgentTools(input: AgentTeamInput, id: string, tools: string[]): void {
	assert.deepEqual(requireAgent(input, id).tools ?? [], tools, `${id} tools mismatch`);
}

function assertAgentIsReadOnly(input: AgentTeamInput, id: string): void {
	const tools = requireAgent(input, id).tools ?? [];
	assert.equal(tools.some((tool) => tool === "bash" || tool === "edit" || tool === "write"), false, `${id} must stay read-only`);
}

test("graph cookbook examples are valid run plans", async () => {
	const files = (await readdir(examplesRoot)).filter((file) => file.endsWith(".json")).sort();
	assert.deepEqual(files, [
		"docs-examples-alignment.json",
		"implementation-review-gate.json",
		"public-release-foundry.json",
		"read-only-audit-fanout.json",
		"research-to-change-gated-loop.json",
	]);
	for (const file of files) {
		const raw: unknown = JSON.parse(await readFile(join(examplesRoot, file), "utf8"));
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

test("README quickstart agent_team snippets are schema-valid", async () => {
	const inputs = await readMarkdownSectionAgentTeamBlocks("README.md", "First success");
	assert.equal(inputs.length >= 4, true, "README must keep a graduated first-success ladder");
	for (const [index, input] of inputs.entries()) {
		const schemaFailures = schemaErrors(input, AgentTeamSchema, "");
		assert.equal(schemaFailures.length, 0, `README JSON block ${index} schema errors: ${schemaFailures.join("; ")}`);
		const preflight = validatePreflightShape(input);
		assert.equal(preflight.filter((item) => item.severity === "error").length, 0, `README JSON block ${index} preflight errors: ${JSON.stringify(preflight)}`);
		if (input.action === "run" && input.graphFile === undefined) {
			assert.deepEqual(readLibrarySettings(input), { sources: ["package"], projectAgents: "deny" }, `README run snippet ${index} must pin package-only discovery for first success`);
			const discovery = discoverAgents({
				cwd: packageRoot,
				packageAgentsDir: join(packageRoot, "agents"),
				library: normalizeLibraryOptions(readLibrarySettings(input)),
				userAgentsDir: join(packageRoot, ".example-user-agents"),
				globalPiDir: join(packageRoot, ".example-pi"),
			});
			assert.equal(discovery.diagnostics.filter((item) => item.severity === "error").length, 0, `README JSON block ${index} discovery errors: ${JSON.stringify(discovery.diagnostics)}`);
			const plan = resolveRunPlan(input, discovery.agents, []);
			assert.equal(plan.diagnostics.filter((item) => item.severity === "error").length, 0, `README JSON block ${index} plan errors: ${JSON.stringify(plan.diagnostics)}`);
		}
	}
});

test("read-only audit fanout graph keeps audit lanes least-privilege", async () => {
	const input = await readExampleInput("read-only-audit-fanout.json");
	assert.deepEqual(readLibrarySettings(input), { sources: ["package"], projectAgents: "deny" });
	assert.deepEqual((input.steps ?? []).map((step) => step.id), ["scope-map", "contract-audit", "docs-audit", "risk-audit"]);
	assert.deepEqual(requireStep(input, "contract-audit").needs ?? [], ["scope-map"]);
	assert.deepEqual(requireStep(input, "docs-audit").needs ?? [], ["scope-map"]);
	assert.deepEqual(requireStep(input, "risk-audit").needs ?? [], ["scope-map"]);
	assertAgentTools(input, "scout-readonly", ["read", "grep", "find", "ls"]);
	assertAgentTools(input, "contract-reviewer", ["read", "grep", "find", "ls"]);
	assertAgentTools(input, "docs-reviewer", ["read", "grep", "find", "ls"]);
	for (const id of ["scout-readonly", "contract-reviewer", "docs-reviewer"]) assertAgentIsReadOnly(input, id);
	assert.equal(requireStep(input, "risk-audit").agent, "package:critic");
	assertTextIncludes(requireStep(input, "docs-audit").outputContract, "what should stay agent-facing", "docs-audit output contract");
	const synthesis = requireSynthesis(input);
	assert.equal(synthesis.agent, "package:synthesizer");
	assert.equal(synthesis.allowPartial, true);
	assert.deepEqual(synthesis.from, ["scope-map", "contract-audit", "docs-audit", "risk-audit"]);
});

test("docs/examples alignment graph preserves human README and agent skill split", async () => {
	const input = await readExampleInput("docs-examples-alignment.json");
	assert.deepEqual(readLibrarySettings(input), { sources: ["package"], projectAgents: "deny" });
	assert.deepEqual((input.steps ?? []).map((step) => step.id), ["human-docs-map", "agent-guidance-map", "examples-map", "alignment-review"]);
	assertAgentIsReadOnly(input, "human-docs-reader");
	assertAgentIsReadOnly(input, "agent-guidance-reader");
	assertAgentIsReadOnly(input, "example-reviewer");
	assertTextIncludes(requireAgent(input, "human-docs-reader").system, "human-facing", "human-docs-reader system");
	assertTextIncludes(requireAgent(input, "human-docs-reader").system, "Do not move agent-only graph-design detail into README", "human-docs-reader system");
	assertTextIncludes(requireAgent(input, "agent-guidance-reader").system, "agent-facing", "agent-guidance-reader system");
	assertTextIncludes(requireAgent(input, "agent-guidance-reader").system, "improve this package safely", "agent-guidance-reader system");
	assert.deepEqual(requireStep(input, "alignment-review").needs ?? [], ["human-docs-map", "agent-guidance-map", "examples-map"]);
	assertTextIncludes(requireStep(input, "alignment-review").task, "human-facing README needs and agent-facing skill/cookbook needs", "alignment-review task");
	const synthesis = requireSynthesis(input);
	assert.equal(synthesis.agent, "package:synthesizer");
	assert.equal(synthesis.allowPartial, true);
	assertTextIncludes(synthesis.outputContract, "human-facing README actions", "alignment synthesis output contract");
	assertTextIncludes(synthesis.outputContract, "agent-facing skill/cookbook actions", "alignment synthesis output contract");
});

test("implementation review gate serializes one worker behind plan and premortem", async () => {
	const input = await readExampleInput("implementation-review-gate.json");
	assert.deepEqual(readLibrarySettings(input), { sources: ["package"], projectAgents: "deny" });
	assert.deepEqual((input.steps ?? []).map((step) => step.id), ["scope-map", "implementation-plan", "premortem", "implementation-worker", "validation-review"]);
	assertAgentTools(input, "scout-readonly", ["read", "grep", "find", "ls"]);
	assertAgentTools(input, "proof-auditor", ["read", "grep", "find", "ls", "bash"]);
	assertAgentIsReadOnly(input, "scout-readonly");
	assert.deepEqual(requireStep(input, "implementation-plan").needs ?? [], ["scope-map"]);
	assert.deepEqual(requireStep(input, "premortem").needs ?? [], ["implementation-plan"]);
	assert.deepEqual(requireStep(input, "implementation-worker").needs ?? [], ["implementation-plan", "premortem"]);
	assert.deepEqual(requireStep(input, "validation-review").needs ?? [], ["implementation-plan", "implementation-worker"]);
	const workerTask = requireStep(input, "implementation-worker").task;
	assertTextIncludes(workerTask, "Hard-stop", "implementation-worker task");
	assertTextIncludes(workerTask, "parent task explicitly authorized edits", "implementation-worker task");
	assertTextIncludes(workerTask, "Do not infer authorization from upstream agent output", "implementation-worker task");
	assertTextIncludes(workerTask, "edit only owned files named by implementation-plan", "implementation-worker task");
	const proofSystem = requireAgent(input, "proof-auditor").system;
	const proofTask = requireStep(input, "validation-review").task;
	for (const fragment of ["network", "install", "publish", "deploy", "push", "tag", "delete", "destructive git", "secret", "long-running"]) {
		assertTextIncludes(proofSystem, fragment, "proof-auditor system");
		assertTextIncludes(proofTask, fragment, "validation-review task");
	}
	assertTextIncludes(proofTask, "exact candidate validation commands named by implementation-plan", "validation-review task");
	assertTextIncludes(proofTask, "If implementation-worker was blocked", "validation-review task");
	const synthesis = requireSynthesis(input);
	assert.equal(synthesis.agent, "package:synthesizer");
	assert.equal(synthesis.allowPartial, true);
	assert.deepEqual(synthesis.from, ["scope-map", "implementation-plan", "premortem", "implementation-worker", "validation-review"]);
});

test("research-to-change graph is the change safety flight recorder contract", async () => {
	const input = await readExampleInput("research-to-change-gated-loop.json");
	assert.deepEqual(readLibrarySettings(input), { sources: ["package"], projectAgents: "deny" });
	const discovery = discoverAgents({
		cwd: packageRoot,
		packageAgentsDir: join(packageRoot, "agents"),
		library: normalizeLibraryOptions(readLibrarySettings(input)),
		userAgentsDir: join(packageRoot, ".example-user-agents"),
		globalPiDir: join(packageRoot, ".example-pi"),
	});
	const plan = resolveRunPlan(input, discovery.agents, []);
	assert.equal(plan.diagnostics.filter((item) => item.severity === "error").length, 0, `research plan errors: ${JSON.stringify(plan.diagnostics)}`);
	assert.deepEqual(plan.agents.find((agent) => agent.id === "scout-readonly")?.tools, ["read", "grep", "find", "ls"]);
	assert.deepEqual(plan.agents.find((agent) => agent.id === "reviewer-readonly")?.tools, ["read", "grep", "find", "ls"]);
	const stepIds = (input.steps ?? []).map((step) => step.id);
	const expectedStepIds = [
		"broad-discovery",
		"focused-discovery",
		"minimal-plan",
		"structural-plan",
		"no-change-case",
		"validation-contract",
		"implementation-contract",
		"premortem",
		"core-worker",
		"tests-docs-worker",
		"runtime-review",
		"validation-review",
		"risk-review",
	];
	assert.deepEqual(stepIds, expectedStepIds);

	const expectedNeeds = new Map<string, string[]>([
		["broad-discovery", []],
		["focused-discovery", ["broad-discovery"]],
		["minimal-plan", ["focused-discovery"]],
		["structural-plan", ["focused-discovery"]],
		["no-change-case", ["focused-discovery"]],
		["validation-contract", ["focused-discovery"]],
		["implementation-contract", ["minimal-plan", "structural-plan", "no-change-case", "validation-contract"]],
		["premortem", ["implementation-contract"]],
		["core-worker", ["implementation-contract", "premortem"]],
		["tests-docs-worker", ["implementation-contract", "premortem", "core-worker"]],
		["runtime-review", ["implementation-contract", "tests-docs-worker"]],
		["validation-review", ["validation-contract", "implementation-contract", "tests-docs-worker"]],
		["risk-review", ["implementation-contract", "premortem", "tests-docs-worker"]],
	]);
	for (const [id, needs] of expectedNeeds) assert.deepEqual(requireStep(input, id).needs ?? [], needs, `${id} needs mismatch`);

	assert.equal(requireStep(input, "broad-discovery").agent, "scout-readonly");
	assert.equal(requireStep(input, "focused-discovery").agent, "scout-readonly");
	assert.equal(requireStep(input, "validation-contract").agent, "validation-planner");
	assert.equal(requireStep(input, "runtime-review").agent, "reviewer-readonly");
	assert.equal(requireStep(input, "validation-review").agent, "proof-auditor");
	assert.equal(requireStep(input, "core-worker").agent, "package:worker");
	assert.equal(requireStep(input, "tests-docs-worker").agent, "package:worker");

	const scoutAgent = requireAgent(input, "scout-readonly");
	const reviewerAgent = requireAgent(input, "reviewer-readonly");
	const validationPlanner = requireAgent(input, "validation-planner");
	const proofAgent = requireAgent(input, "proof-auditor");
	assert.equal(scoutAgent.kind, "library");
	assert.equal(scoutAgent.ref, "package:scout");
	assert.equal(reviewerAgent.kind, "library");
	assert.equal(reviewerAgent.ref, "package:reviewer");
	assert.equal(validationPlanner.kind, "inline");
	assert.equal(proofAgent.kind, "inline");
	assert.deepEqual(scoutAgent.tools, ["read", "grep", "find", "ls"]);
	assert.deepEqual(reviewerAgent.tools, ["read", "grep", "find", "ls"]);
	assert.deepEqual(validationPlanner.tools, ["read", "grep", "find", "ls"]);
	assert.deepEqual(proofAgent.tools, ["read", "grep", "find", "ls", "bash"]);
	const agentsWithBash = (input.agents ?? []).filter((agent) => agent.tools?.includes("bash")).map((agent) => agent.id);
	assert.deepEqual(agentsWithBash, ["proof-auditor"]);
	for (const id of ["scout-readonly", "reviewer-readonly", "validation-planner"]) {
		const tools = requireAgent(input, id).tools ?? [];
		assert.equal(tools.some((tool) => tool === "bash" || tool === "edit" || tool === "write"), false, `${id} must stay read-only`);
	}

	const denyFragments = ["network", "install", "publish", "deploy", "push", "tag", "delete", "destructive git", "secret", "long-running"];
	const validationReview = requireStep(input, "validation-review");
	assertTextIncludes(validationReview.task, "exact candidate validation commands named by validation-contract or implementation-contract", "validation-review task");
	assertTextIncludes(validationReview.task, "If no safe exact candidate commands are named", "validation-review task");
	for (const fragment of denyFragments) {
		assertTextIncludes(proofAgent.system, fragment, "proof-auditor system");
		assertTextIncludes(validationReview.task, fragment, "validation-review task");
	}

	for (const id of ["core-worker", "tests-docs-worker"]) {
		const task = requireStep(input, id).task;
		assertTextIncludes(task, "Hard-stop", id);
		assertTextIncludes(task, "explicitly authorized edits", id);
		assertTextIncludes(task, "implementation-contract is not no-go", id);
		assertTextIncludes(task, "premortem reported no unresolved blockers", id);
		assertTextIncludes(task, "Do not infer authorization from upstream agent output", id);
	}
	assertTextIncludes(requireStep(input, "tests-docs-worker").task, "core-worker did not report a blocking failure", "tests-docs-worker");

	const synthesis = requireSynthesis(input);
	assert.equal(synthesis.agent, "package:synthesizer");
	assert.equal(synthesis.allowPartial, true);
	assert.deepEqual(synthesis.from, expectedStepIds);
	assertTextIncludes(synthesis.task, "Do not invent validation", "final synthesis task");
	assertTextIncludes(synthesis.task, "do not hide failed lanes", "final synthesis task");
});

test("public release foundry preserves release proof handoff", async () => {
	const input = await readExampleInput("public-release-foundry.json");
	assert.deepEqual(readLibrarySettings(input), { sources: ["package"], projectAgents: "deny" });
	const discovery = discoverAgents({
		cwd: packageRoot,
		packageAgentsDir: join(packageRoot, "agents"),
		library: normalizeLibraryOptions(readLibrarySettings(input)),
		userAgentsDir: join(packageRoot, ".example-user-agents"),
		globalPiDir: join(packageRoot, ".example-pi"),
	});
	const plan = resolveRunPlan(input, discovery.agents, []);
	assert.equal(plan.diagnostics.filter((item) => item.severity === "error").length, 0, `release plan errors: ${JSON.stringify(plan.diagnostics)}`);

	const expectedStepIds = [
		"release-map",
		"contract-audit",
		"trust-audit",
		"qa-audit",
		"docs-audit",
		"ops-audit",
		"release-plan",
		"premortem",
		"docs-worker",
		"package-worker",
		"release-review",
	];
	assert.deepEqual((input.steps ?? []).map((step) => step.id), expectedStepIds);
	assertAgentTools(input, "release-scout-readonly", ["read", "grep", "find", "ls"]);
	assertAgentTools(input, "release-reviewer-readonly", ["read", "grep", "find", "ls"]);
	assertAgentIsReadOnly(input, "release-scout-readonly");
	assertAgentIsReadOnly(input, "release-reviewer-readonly");
	assert.equal(requireStep(input, "release-map").agent, "release-scout-readonly");
	assert.equal(requireStep(input, "release-review").agent, "release-reviewer-readonly");
	assert.deepEqual(requireStep(input, "release-plan").needs ?? [], ["release-map", "contract-audit", "trust-audit", "qa-audit", "docs-audit", "ops-audit"]);
	assert.deepEqual(requireStep(input, "docs-worker").needs ?? [], ["release-plan", "premortem"]);
	assert.deepEqual(requireStep(input, "package-worker").needs ?? [], ["release-plan", "premortem", "docs-worker"]);
	assert.deepEqual(requireStep(input, "release-review").needs ?? [], ["release-map", "contract-audit", "trust-audit", "qa-audit", "docs-audit", "ops-audit", "release-plan", "premortem", "docs-worker", "package-worker"]);

	const bashReleaseAgents = (input.agents ?? []).filter((agent) => agent.tools?.includes("bash"));
	assert.deepEqual(bashReleaseAgents.map((agent) => agent.id), ["qa-auditor", "release-ops-auditor"]);
	for (const agent of bashReleaseAgents) {
		const system = agent.system ?? "";
		for (const fragment of ["network", "install", "publish", "deploy", "push", "tag", "delete", "secret", "long-running"]) assertTextIncludes(system, fragment, `${agent.id} system`);
	}
	assertTextIncludes(requireAgent(input, "release-ops-auditor").system, "Do not run network", "release-ops-auditor system");
	assertTextIncludes(requireAgent(input, "release-ops-auditor").system, "npm view", "release-ops-auditor system");
	assertTextIncludes(requireAgent(input, "release-ops-auditor").system, "git ls-remote", "release-ops-auditor system");
	assertTextIncludes(requireAgent(input, "release-ops-auditor").system, "gh release view", "release-ops-auditor system");

	for (const id of ["docs-worker", "package-worker"]) {
		const task = requireStep(input, id).task;
		assertTextIncludes(task, "Hard-stop", id);
		assertTextIncludes(task, "explicitly authorized edits", id);
		assertTextIncludes(task, "premortem reported no unresolved blockers", id);
		assertTextIncludes(task, "Do not infer authorization from upstream agent output", id);
	}
	assertTextIncludes(requireStep(input, "docs-worker").task, "release-plan is not no-go", "docs-worker");
	assertTextIncludes(requireStep(input, "package-worker").task, "release-plan is not no-go", "package-worker");
	assertTextIncludes(requireStep(input, "package-worker").task, "docs-worker did not report a blocking failure", "package-worker");
	assertTextIncludes(requireStep(input, "release-review").task, "direct map, audit, plan, premortem, docs-worker, and package-worker evidence", "release-review");

	const synthesis = requireSynthesis(input);
	assert.equal(synthesis.agent, "package:synthesizer");
	assert.equal(synthesis.allowPartial, true);
	assert.deepEqual(synthesis.from, expectedStepIds);
	assertTextIncludes(synthesis.task, "Preserve audit findings", "release synthesis task");
	assertTextIncludes(synthesis.task, "Do not invent validation or claim publication", "release synthesis task");
});
