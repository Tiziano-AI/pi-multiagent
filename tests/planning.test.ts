import assert from "node:assert/strict";
import test from "node:test";
import { resolveRunPlan, validateActionShape, validatePreflightShape } from "../extensions/multiagent/src/planning.ts";
import type { AgentConfig, AgentDiagnostic } from "../extensions/multiagent/src/types.ts";

const noDiagnostics: AgentDiagnostic[] = [];

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
	const wrapper = validatePreflightShape({ action: "run", graphFile: "examples/graphs/research-to-change-gated-loop.json" });
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
	assert.equal(plan.diagnostics.some((item) => item.code === "agent-tool-invalid" && item.message.includes("read, grep, find, ls, bash, edit, and write")), true);
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
