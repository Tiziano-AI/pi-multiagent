import assert from "node:assert/strict";
import test from "node:test";
import { Compile } from "typebox/compile";
import { normalizeLimits } from "../extensions/multiagent/src/limits.ts";
import { AgentTeamSchema } from "../extensions/multiagent/src/schemas.ts";
import { DEFAULT_CONCURRENCY, DEFAULT_MAX_RUN_SECONDS, DEFAULT_NOTIFY_MAX_NOTICES, DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS, DEFAULT_RESULT_PREVIEW_MAX_BYTES, DEFAULT_TERMINAL_RETENTION_SECONDS, DEFAULT_TIMEOUT_SECONDS_PER_STEP, MAX_CLIENT_MESSAGE_ID_CHARS, MAX_CONCURRENCY, MAX_MAX_RUN_SECONDS, MAX_PARENT_MESSAGE_CHARS, MAX_PATH_FIELD_CHARS, MAX_RESULT_PREVIEW_BYTES, MAX_RUN_STATUS_WAIT_SECONDS, MAX_STEPS, MAX_TERMINAL_RETENTION_SECONDS, MAX_TEXT_FIELD_CHARS, MAX_TIMEOUT_SECONDS_PER_STEP } from "../extensions/multiagent/src/types.ts";

const validate = Compile(AgentTeamSchema);

const graph = {
	objective: "prove detached contract",
	steps: [{ id: "one", agent: { system: "Return ok." }, task: "Return ok." }],
};

test("AgentTeamSchema exposes detached-only action set and rejects run", () => {
	for (const action of ["catalog", "start", "run_status", "step_result", "message", "cancel", "cleanup"]) {
		const input = action === "start" ? { action, graph } : action === "step_result" ? { action, runId: "r1", stepId: "one" } : action === "message" ? { action, runId: "r1", stepId: "one", channel: "steer", text: "continue" } : action === "catalog" ? { action } : { action, runId: "r1" };
		assert.equal(validate.Check(input), true, action);
	}
	assert.equal(validate.Check({ action: "run", runId: "r1", stepId: "one" }), false, "run must stay absent");
	assert.equal(validate.Check({ action: "unknown", runId: "r1", stepId: "one" }), false, "unknown actions must stay absent");
});

test("AgentTeamSchema preserves public field bounds and defaults", () => {
	const root = AgentTeamSchema.properties;
	const graphSchema = root.graph;
	const startOptions = root.options.properties;
	const stepSchema = graphSchema.properties.steps.items.properties;
	const stepAgent = stepSchema.agent.properties;
	assert.equal(root.graphFile.maxLength, MAX_PATH_FIELD_CHARS);
	assert.equal(root.text.maxLength, MAX_PARENT_MESSAGE_CHARS);
	assert.equal(root.clientMessageId.maxLength, MAX_CLIENT_MESSAGE_ID_CHARS);
	assert.equal(root.runId.minLength, 2);
	assert.equal(root.runId.maxLength, 8);
	assert.match(root.runId.description, /Short process-local/);
	assert.equal(root.maxBytes.maximum, MAX_RESULT_PREVIEW_BYTES);
	assert.equal(root.maxBytes.multipleOf, 1);
	assert.equal(root.waitSeconds.maximum, MAX_RUN_STATUS_WAIT_SECONDS);
	assert.equal(root.waitSeconds.multipleOf, 1);
	assert.equal(startOptions.maxRunSeconds.default, DEFAULT_MAX_RUN_SECONDS);
	assert.equal(startOptions.maxRunSeconds.maximum, MAX_MAX_RUN_SECONDS);
	assert.equal(startOptions.maxRunSeconds.multipleOf, 1);
	assert.equal(startOptions.terminalRetentionSeconds.default, DEFAULT_TERMINAL_RETENTION_SECONDS);
	assert.equal(startOptions.terminalRetentionSeconds.maximum, MAX_TERMINAL_RETENTION_SECONDS);
	assert.equal(startOptions.terminalRetentionSeconds.multipleOf, 1);
	assert.equal(startOptions.notify.properties.minIntervalSeconds.multipleOf, 1);
	assert.equal(graphSchema.properties.objective.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(graphSchema.properties.steps.maxItems, MAX_STEPS);
	assert.equal(graphSchema.properties.limits.properties.concurrency.maximum, MAX_CONCURRENCY);
	assert.equal(graphSchema.properties.limits.properties.concurrency.multipleOf, 1);
	assert.match(graphSchema.properties.limits.properties.concurrency.description, new RegExp(`Default ${DEFAULT_CONCURRENCY}`));
	assert.equal(graphSchema.properties.limits.properties.timeoutSecondsPerStep.default, DEFAULT_TIMEOUT_SECONDS_PER_STEP);
	assert.equal(graphSchema.properties.limits.properties.timeoutSecondsPerStep.maximum, MAX_TIMEOUT_SECONDS_PER_STEP);
	assert.equal(graphSchema.properties.limits.properties.timeoutSecondsPerStep.multipleOf, 1);
	assert.equal(stepSchema.task.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(stepSchema.cwd.maxLength, MAX_PATH_FIELD_CHARS);
	assert.equal(stepAgent.system.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(stepAgent.ref.maxLength, 72);
	assert.match(root.action.description, /Action decision/);
	assert.match(root.library.properties.sources.description, /Catalog-only sources/);
	assert.match(graphSchema.properties.library.properties.sources.description, /Start-only library sources/);
	assert.match(root.stepId.description, /run_status wait\/debug targeting/);
	assert.match(root.stepId.description, /does not select step text/);
	assert.match(root.maxBytes.description, /run_status\/step_result-only/);
	assert.match(root.text.description, /not impatience/);
});

test("normalizeLimits keeps default concurrency below the maximum", () => {
	assert.equal(normalizeLimits(graph).concurrency, DEFAULT_CONCURRENCY);
	assert.equal(normalizeLimits({ ...graph, limits: { concurrency: MAX_CONCURRENCY } }).concurrency, MAX_CONCURRENCY);
	assert.equal(normalizeLimits({ ...graph, limits: { concurrency: MAX_CONCURRENCY + 1 } }).concurrency, MAX_CONCURRENCY);
});

test("AgentTeamSchema keeps start graph pure and bounded", () => {
	assert.equal(validate.Check({ action: "start", graph, options: { maxRunSeconds: DEFAULT_MAX_RUN_SECONDS, terminalRetentionSeconds: DEFAULT_TERMINAL_RETENTION_SECONDS, notify: { mode: "milestones", maxNotices: DEFAULT_NOTIFY_MAX_NOTICES, minIntervalSeconds: DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS } } }), true);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, steps: [] } }), false);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, steps: [{ id: "bad_id", agent: { system: "x" }, task: "x" }] } }), false);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, authority: { allowShellTools: true, allowMutationTools: true } } }), true);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, steps: [{ id: "one", agent: { system: "x", tools: ["exa_search"] }, task: "x" }] } }), false);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, synthesis: { task: "old" } } }), false);
	assert.equal(validate.Check({ action: "start", graph, options: { maxRunSeconds: 1.5 } }), false);
	assert.equal(validate.Check({ action: "start", graph, options: { terminalRetentionSeconds: 1.5 } }), false);
	assert.equal(validate.Check({ action: "start", graph, options: { notify: { minIntervalSeconds: 0.5 } } }), false);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, limits: { concurrency: MAX_CONCURRENCY } } }), true);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, limits: { concurrency: MAX_CONCURRENCY + 1 } } }), false);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, limits: { concurrency: 1.5 } } }), false);
	assert.equal(validate.Check({ action: "start", graph: { ...graph, limits: { timeoutSecondsPerStep: 1.5 } } }), false);
	assert.equal(validate.Check({ action: "run_status", runId: "r1", maxBytes: 1.5 }), false);
});

test("AgentTeamSchema bounds run_status and message controls", () => {
	const runId = "r1";
	assert.equal(validate.Check({ action: "run_status", runId: "r9999999" }), true);
	assert.equal(validate.Check({ action: "run_status", runId: "r0" }), false);
	assert.equal(validate.Check({ action: "run_status", runId: "r01" }), false);
	assert.equal(validate.Check({ action: "run_status", runId: "r10000000" }), false);
	assert.equal(validate.Check({ action: "run_status", runId: "agt_abcdefghijklmnopqrstuvwxyzABCDEF1234567890-_" }), false);
	assert.equal(validate.Check({ action: "run_status", runId, maxBytes: DEFAULT_RESULT_PREVIEW_MAX_BYTES, debugEvents: true }), true);
	assert.equal(validate.Check({ action: "run_status", runId, stepId: "one", waitSeconds: 1 }), true);
	assert.equal(validate.Check({ action: "run_status", runId, waitSeconds: MAX_RUN_STATUS_WAIT_SECONDS + 1 }), false);
	assert.equal(validate.Check({ action: "step_result", runId, stepId: "one" }), true);
	assert.equal(validate.Check({ action: "message", runId, stepId: "one", channel: "follow_up", text: "x", clientMessageId: "m" }), true);
	assert.equal(validate.Check({ action: "message", runId, stepId: "one", channel: "chat", text: "x" }), false);
	assert.equal(validate.Check({ action: "message", runId, stepId: "one", channel: "steer", text: "", }), false);
	assert.equal(validate.Check({ action: "message", runId, stepId: "one", channel: "steer", kind: "steer", text: "x" }), false);
});
