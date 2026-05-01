import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveRunPlan, validateActionShape, validatePreflightShape } from "../extensions/multiagent/src/planning.ts";
import type { AgentConfig, AgentDiagnostic, ExtensionSourceScope, ParentToolInventory } from "../extensions/multiagent/src/types.ts";

const noDiagnostics: AgentDiagnostic[] = [];
const extensionToolPolicy = { projectExtensions: "deny", localExtensions: "deny" } as const;

async function makeToolInventory(scope: ExtensionSourceScope = "user", options: { source?: string; active?: boolean; cwdInside?: boolean; extraReserved?: string[] } = {}) {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-tools-"));
	const cwd = join(root, "workspace");
	const extensionDir = options.cwdInside === true ? cwd : join(root, "cache");
	await mkdir(extensionDir, { recursive: true });
	const extensionPath = join(extensionDir, "exa-extension.ts");
	await writeFile(extensionPath, "export default function extension() {}\n", "utf8");
	const source = options.source ?? "npm:pi-exa-tools";
	const inventory: ParentToolInventory = {
		apiAvailable: true,
		errorMessage: undefined,
		tools: [
			{
				name: "exa_search",
				description: "Search the web",
				active: options.active ?? true,
				sourceInfo: { path: extensionPath, source, scope, origin: "package", baseDir: undefined },
			},
			...(options.extraReserved ?? []).map((name) => ({
				name,
				description: "reserved",
				active: true,
				sourceInfo: { path: extensionPath, source, scope, origin: "package" as const, baseDir: undefined },
			})),
		],
	};
	return { root, cwd, extensionPath, inventory, source };
}

const reviewer: AgentConfig = {
	name: "reviewer",
	ref: "package:reviewer",
	description: "Reviews code",
	tools: ["read", "grep"],
	model: undefined,
	thinking: undefined,
	systemPrompt: "Review carefully.",
	source: "package",
	filePath: "/pkg/reviewer.md",
	sha256: "a".repeat(64),
};

const userReviewer: AgentConfig = {
	...reviewer,
	ref: "user:reviewer",
	description: "User reviewer",
	systemPrompt: "User review carefully.",
	source: "user",
	filePath: "/user/reviewer.md",
	sha256: "b".repeat(64),
};

test("validateActionShape rejects catalog calls carrying run payload", () => {
	const diagnostics = validateActionShape({
		action: "catalog",
		objective: "should not be here",
		agents: [{ id: "critic", kind: "inline", system: "x" }],
		steps: [{ id: "s", agent: "critic", task: "x" }],
	});
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, "catalog-run-fields-denied");
});

test("validatePreflightShape rejects missing action", () => {
	const diagnostics = validatePreflightShape({ agents: [{ id: "worker", kind: "inline", system: "x" }], steps: [{ id: "s", agent: "worker", task: "x" }] });
	assert.equal(diagnostics.some((item) => item.code === "action-required" && item.path === "/action"), true);
});

test("validatePreflightShape rejects invalid run shapes before confirmation", () => {
	const diagnostics = validatePreflightShape({ action: "run", library: { sources: ["project"], query: "review", projectAgents: "confirm" } });
	assert.equal(diagnostics.some((item) => item.code === "objective-required" && item.path === "/objective"), true);
	assert.equal(diagnostics.some((item) => item.code === "steps-required" && item.path === "/steps"), true);
	assert.equal(diagnostics.some((item) => item.code === "run-library-query-denied" && item.path === "/library/query"), true);
});

test("validatePreflightShape treats graphFile as a complete run graph wrapper", () => {
	const wrapper = validatePreflightShape({ action: "run", graphFile: "research-to-change-gated-loop.json" });
	assert.equal(wrapper.some((item) => item.code === "objective-required"), false);
	assert.equal(wrapper.some((item) => item.code === "steps-required"), false);

	const mixed = validatePreflightShape({ action: "run", graphFile: "graph.json", objective: "inline", steps: [{ id: "one", agent: "package:reviewer", task: "review" }] });
	assert.equal(mixed.some((item) => item.code === "graph-file-inline-fields-denied"), true);
});

test("resolveRunPlan supports inline agents and dependency synthesis", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "Audit model-native surface",
			agents: [
				{
					id: "critic",
					kind: "inline",
					description: "Critiques API",
					system: "You critique APIs.",
					tools: ["read"],
				},
			],
			steps: [{ id: "critique", agent: "critic", task: "Critique the surface." }],
			synthesis: { task: "Summarize critique." },
		},
		[],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.filter((item) => item.severity === "error").length, 0);
	assert.equal(plan.agents.some((agent) => agent.id === "critic"), true);
	assert.equal(plan.agents.find((agent) => agent.id === "critic")?.tools.join(","), "read");
	assert.equal(plan.agents.some((agent) => agent.id === "agent-team-synthesizer"), true);
	assert.deepEqual(plan.steps.map((step) => step.id), ["critique", "synthesis"]);
	assert.deepEqual(plan.steps[1].needs, ["critique"]);
});

test("resolveRunPlan defaults inline agents without tools to no tools", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "No tools",
			agents: [{ id: "quiet", kind: "inline", system: "Answer directly." }],
			steps: [{ id: "answer", agent: "quiet", task: "Answer." }],
		},
		[],
		noDiagnostics,
	);
	assert.deepEqual(plan.agents.find((agent) => agent.id === "quiet")?.tools, []);
});

test("resolveRunPlan binds source-qualified library agents without adding built-in synthesizer", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "Review",
			agents: [{ id: "review", kind: "library", ref: "package:reviewer", outputContract: "Findings first." }],
			steps: [{ id: "r", agent: "review", task: "Review current diff." }],
		},
		[reviewer, userReviewer],
		noDiagnostics,
	);
	const resolved = plan.agents.find((agent) => agent.id === "review");
	assert.equal(resolved?.name, "reviewer");
	assert.equal(resolved?.ref, "package:reviewer");
	assert.equal(resolved?.outputContract, "Findings first.");
	assert.equal(plan.agents.some((agent) => agent.id === "agent-team-synthesizer"), false);
});

test("resolveRunPlan supports direct source-qualified step refs and rejects bare library names", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "Review",
			steps: [
				{ id: "package-step", agent: "package:reviewer", task: "Use package reviewer." },
				{ id: "bare-step", agent: "reviewer", task: "Use bare library name." },
			],
		},
		[reviewer, userReviewer],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.some((item) => item.code === "step-agent-unknown" && item.path === "/steps/1/agent"), true);
	assert.equal(plan.agents.find((agent) => agent.id === "package:reviewer")?.ref, "package:reviewer");
	assert.equal(plan.agents.some((agent) => agent.id === "reviewer"), false);
});

test("resolveRunPlan rejects invalid inline and library tool names", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "bad tools",
			agents: [
				{ id: "inline", kind: "inline", system: "x", tools: ["bad/tool"] },
				{ id: "review", kind: "library", ref: "package:reviewer", tools: ["also.bad"] },
			],
			steps: [
				{ id: "one", agent: "inline", task: "x" },
				{ id: "two", agent: "review", task: "x" },
			],
		},
		[reviewer],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.filter((item) => item.code === "agent-tool-invalid").length, 2);
	assert.equal(plan.diagnostics.some((item) => item.code === "agent-tool-invalid" && item.path === "/agents/0/tools"), true);
	assert.equal(plan.diagnostics.some((item) => item.code === "agent-tool-invalid" && item.path === "/agents/1/tools"), true);
	assert.equal(plan.diagnostics.some((item) => item.code === "step-agent-unknown" && item.path === "/steps/0/agent"), true);
});

test("resolveRunPlan rejects syntactically valid unavailable tools", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "bad tool",
			agents: [{ id: "inline", kind: "inline", system: "x", tools: ["webFetch"] }],
			steps: [{ id: "one", agent: "inline", task: "x" }],
		},
		[],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.some((item) => item.code === "agent-tool-invalid" && item.message.includes("Extension tools such as exa_search must use extensionTools[]")), true);
});

test("resolveRunPlan accepts source-qualified active extension tools", async () => {
	const fixture = await makeToolInventory();
	try {
		const plan = resolveRunPlan(
			{
				action: "run",
				objective: "web research",
				agents: [{ id: "searcher", kind: "inline", system: "Search.", extensionTools: [{ name: "exa_search", from: { source: fixture.source, scope: "user", origin: "package" } }] }],
				steps: [{ id: "search", agent: "searcher", task: "Search." }],
			},
			[],
			noDiagnostics,
			{ parentTools: fixture.inventory, extensionToolPolicy, cwd: fixture.cwd },
		);
		assert.equal(plan.diagnostics.some((item) => item.severity === "error"), false);
		const agent = plan.agents.find((candidate) => candidate.id === "searcher");
		assert.deepEqual(agent?.tools, []);
		assert.equal(agent?.extensionTools[0]?.name, "exa_search");
		assert.equal(agent?.extensionTools[0]?.source.source, fixture.source);
	} finally {
		await rm(fixture.root, { recursive: true, force: true });
	}
});

test("resolveRunPlan denies unsafe extension tool grants", async () => {
	const active = await makeToolInventory();
	const inactive = await makeToolInventory("user", { active: false });
	const project = await makeToolInventory("project");
	const local = await makeToolInventory("user", { cwdInside: true });
	const sdk = await makeToolInventory("user", { source: "sdk" });
	const collision = await makeToolInventory("user", { extraReserved: ["read"] });
	const duplicate = await makeToolInventory();
	const hardlink = await makeToolInventory();
	const large = await makeToolInventory();
	const hardlinkPath = join(hardlink.root, "cache", "agent-team-hardlink.ts");
	await link(hardlink.extensionPath, hardlinkPath);
	await writeFile(large.extensionPath, Buffer.alloc(4 * 1024 * 1024 + 1));
	try {
		const duplicateInventory = { ...active.inventory, tools: [...active.inventory.tools, ...duplicate.inventory.tools] };
		const hardlinkInventory = {
			...hardlink.inventory,
			tools: [
				...hardlink.inventory.tools,
				{ name: "agent_team", description: "recursive", active: true, sourceInfo: { path: hardlinkPath, source: "local-hardlink", scope: "user" as const, origin: "top-level" as const, baseDir: undefined } },
			],
		};
		const cases = [
			{ name: "missing", fixture: active, grant: { name: "exa_fetch", from: { source: active.source, scope: "user", origin: "package" } }, code: "extension-tool-unavailable" },
			{ name: "inactive", fixture: inactive, grant: { name: "exa_search", from: { source: inactive.source, scope: "user", origin: "package" } }, code: "extension-tool-inactive" },
			{ name: "mismatch", fixture: active, grant: { name: "exa_search", from: { source: "npm:other", scope: "user", origin: "package" } }, code: "extension-tool-source-mismatch" },
			{ name: "project", fixture: project, grant: { name: "exa_search", from: { source: project.source, scope: "project", origin: "package" } }, code: "extension-tool-project-denied" },
			{ name: "local", fixture: local, grant: { name: "exa_search", from: { source: local.source, scope: "user", origin: "package" } }, code: "extension-tool-local-denied" },
			{ name: "sdk", fixture: sdk, grant: { name: "exa_search", from: { source: sdk.source, scope: "user", origin: "package" } }, code: "extension-tool-sdk-unloadable" },
			{ name: "collision", fixture: collision, grant: { name: "exa_search", from: { source: collision.source, scope: "user", origin: "package" } }, code: "extension-tool-builtin-collision" },
			{ name: "hardlink", fixture: { ...hardlink, inventory: hardlinkInventory }, grant: { name: "exa_search", from: { source: hardlink.source, scope: "user", origin: "package" } }, code: "extension-tool-recursion-denied" },
			{ name: "large", fixture: large, grant: { name: "exa_search", from: { source: large.source, scope: "user", origin: "package" } }, code: "extension-tool-source-unloadable" },
			{ name: "ambiguous", fixture: { ...active, inventory: duplicateInventory }, grant: { name: "exa_search", from: { source: active.source, scope: "user", origin: "package" } }, code: "extension-tool-active-ambiguous" },
			{ name: "reserved-builtin", fixture: active, grant: { name: "read", from: { source: active.source, scope: "user", origin: "package" } }, code: "extension-tool-reserved" },
			{ name: "reserved", fixture: active, grant: { name: "agent_team", from: { source: active.source, scope: "user", origin: "package" } }, code: "extension-tool-reserved" },
		];
		for (const item of cases) {
			const plan = resolveRunPlan(
				{
					action: "run",
					objective: item.name,
					agents: [{ id: "searcher", kind: "inline", system: "Search.", extensionTools: [item.grant] }],
					steps: [{ id: "search", agent: "searcher", task: "Search." }],
				},
				[],
				noDiagnostics,
				{ parentTools: item.fixture.inventory, extensionToolPolicy, cwd: item.fixture.cwd },
			);
			assert.equal(plan.diagnostics.some((diagnostic) => diagnostic.code === item.code), true, item.name);
		}
	} finally {
		await Promise.all([active, inactive, project, local, sdk, collision, duplicate, hardlink, large].map((fixture) => rm(fixture.root, { recursive: true, force: true })));
	}
});

test("resolveRunPlan rejects malformed invocation-local agent bindings", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "bad bindings",
			agents: [
				{ id: "inline", kind: "inline", ref: "package:reviewer", system: "x" },
				{ id: "missing-ref", kind: "library" },
				{ id: "bare-ref", kind: "library", ref: "reviewer" },
			],
			steps: [
				{ id: "one", agent: "inline", task: "x" },
				{ id: "two", agent: "missing-ref", task: "x" },
				{ id: "three", agent: "bare-ref", task: "x" },
			],
		},
		[reviewer],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.some((item) => item.code === "inline-agent-ref-denied" && item.path === "/agents/0/ref"), true);
	assert.equal(plan.diagnostics.some((item) => item.code === "library-agent-ref-required" && item.path === "/agents/1/ref"), true);
	assert.equal(plan.diagnostics.some((item) => item.code === "library-agent-ref-invalid" && item.path === "/agents/2/ref"), true);
});

test("resolveRunPlan rejects library binding system override", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "deny library system",
			agents: [{ id: "review", kind: "library", ref: "package:reviewer", system: "Override package prompt." }],
			steps: [{ id: "review-step", agent: "review", task: "Review." }],
		},
		[reviewer],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.some((item) => item.code === "library-agent-system-denied" && item.path === "/agents/0/system"), true);
	assert.equal(plan.diagnostics.some((item) => item.code === "step-agent-unknown" && item.path === "/steps/0/agent"), true);
});

test("resolveRunPlan de-duplicates upstream refs preserving order", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "dedupe upstream",
			agents: [{ id: "worker", kind: "inline", system: "Work." }],
			steps: [
				{ id: "one", agent: "worker", task: "One." },
				{ id: "two", agent: "worker", task: "Two.", needs: ["one", "one"] },
			],
			synthesis: { task: "Summarize.", from: ["one", "one", "two"] },
		},
		[],
		noDiagnostics,
	);
	assert.deepEqual(plan.steps.find((step) => step.id === "two")?.needs, ["one"]);
	assert.deepEqual(plan.steps.find((step) => step.synthesis)?.needs, ["one", "two"]);
});

test("resolveRunPlan rejects invalid ids, empty tasks, and reserved public refs", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "bad graph",
			agents: [{ id: "../escape", kind: "inline", system: "sys" }],
			steps: [{ id: "", agent: "../escape", task: "" }],
			synthesis: { id: "__synthesizer", task: "sum", from: [""] },
		},
		[],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.some((item) => item.code === "public-id-invalid" && item.path === "/agents/0/id"), true);
	assert.equal(plan.diagnostics.some((item) => item.code === "public-id-invalid" && item.path === "/steps/0/id"), true);
	assert.equal(plan.diagnostics.some((item) => item.code === "step-task-required" && item.path === "/steps/0/task"), true);
});

test("resolveRunPlan rejects whitespace-only synthesis task", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "blank synthesis",
			agents: [{ id: "worker", kind: "inline", system: "x" }],
			steps: [{ id: "one", agent: "worker", task: "x" }],
			synthesis: { task: "   " },
		},
		[],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.some((item) => item.code === "synthesis-task-required" && item.path === "/synthesis/task"), true);
});

test("resolveRunPlan rejects normal steps depending on synthesis", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "synthesis is terminal",
			agents: [{ id: "worker", kind: "inline", system: "x" }],
			steps: [
				{ id: "one", agent: "worker", task: "x" },
				{ id: "after", agent: "worker", task: "must not run after synthesis", needs: ["final"] },
			],
			synthesis: { id: "final", task: "summarize", from: ["one"] },
		},
		[],
		noDiagnostics,
	);
	const diagnostic = plan.diagnostics.find((item) => item.code === "synthesis-must-be-terminal" && item.path === "/steps/1/needs");
	assert.equal(diagnostic?.severity, "error");
	assert.equal(diagnostic?.message.includes("cannot be used as an intermediate dependency"), true);
});

test("resolveRunPlan reserves the public default synthesizer id", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "reserved id",
			agents: [{ id: "agent-team-synthesizer", kind: "inline", system: "x" }],
			steps: [{ id: "one", agent: "agent-team-synthesizer", task: "Use explicit." }],
		},
		[],
		noDiagnostics,
	);
	assert.equal(plan.diagnostics.some((item) => item.code === "agent-id-reserved" && item.path === "/agents/0/id"), true);
});

test("resolveRunPlan reports cycles and unknown agents", () => {
	const plan = resolveRunPlan(
		{
			action: "run",
			objective: "bad graph",
			steps: [
				{ id: "a", agent: "missing", task: "A", needs: ["b"] },
				{ id: "b", agent: "missing", task: "B", needs: ["a"] },
			],
		},
		[],
		noDiagnostics,
	);
	const unknown = plan.diagnostics.find((item) => item.code === "step-agent-unknown" && item.path === "/steps/0/agent");
	assert.equal(unknown?.message.includes("source-qualified library ref"), true);
	assert.equal(unknown?.message.includes("catalog"), true);
	const cycle = plan.diagnostics.find((item) => item.code === "step-cycle");
	assert.equal(cycle?.message, "Dependency cycle: a -> b -> a.");
	assert.equal(cycle?.path, "/steps");
});
