import assert from "node:assert/strict";
import test from "node:test";
import { Compile } from "typebox/compile";
import { normalizeLimits } from "../extensions/multiagent/src/limits.ts";
import { AgentTeamSchema } from "../extensions/multiagent/src/schemas.ts";
import {
	DEFAULT_TIMEOUT_SECONDS_PER_STEP,
	MAX_CONCURRENCY,
	MAX_MODEL_FIELD_CHARS,
	MAX_PATH_FIELD_CHARS,
	MAX_SHORT_TEXT_FIELD_CHARS,
	MAX_TEXT_FIELD_CHARS,
	MAX_TIMEOUT_SECONDS_PER_STEP,
} from "../extensions/multiagent/src/types.ts";

function acceptsLength(schema: { minLength?: number; maxLength?: number }, length: number): boolean {
	const min = schema.minLength ?? 0;
	const max = schema.maxLength ?? Number.POSITIVE_INFINITY;
	return length >= min && length <= max;
}

test("AgentTeamSchema bounds caller text field lengths", () => {
	const root = AgentTeamSchema.properties;
	const library = root.library.properties;
	const agent = root.agents.items.properties;
	const step = root.steps.items.properties;
	const synthesis = root.synthesis.properties;

	assert.equal(root.objective.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(root.graphFile.maxLength, MAX_PATH_FIELD_CHARS);
	assert.equal(library.query.maxLength, MAX_SHORT_TEXT_FIELD_CHARS);
	assert.equal(agent.description.maxLength, MAX_SHORT_TEXT_FIELD_CHARS);
	assert.equal(agent.system.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(agent.model.maxLength, MAX_MODEL_FIELD_CHARS);
	assert.equal(agent.cwd.maxLength, MAX_PATH_FIELD_CHARS);
	assert.equal(agent.outputContract.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(step.task.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(step.cwd.maxLength, MAX_PATH_FIELD_CHARS);
	assert.equal(step.outputContract.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(synthesis.task.maxLength, MAX_TEXT_FIELD_CHARS);
	assert.equal(synthesis.outputContract.maxLength, MAX_TEXT_FIELD_CHARS);

	assert.equal(acceptsLength(root.graphFile, MAX_PATH_FIELD_CHARS), true);
	assert.equal(acceptsLength(root.graphFile, MAX_PATH_FIELD_CHARS + 1), false);
	assert.equal(acceptsLength(step.task, MAX_TEXT_FIELD_CHARS), true);
	assert.equal(acceptsLength(step.task, MAX_TEXT_FIELD_CHARS + 1), false);
	assert.equal(acceptsLength(agent.model, MAX_MODEL_FIELD_CHARS), true);
	assert.equal(acceptsLength(agent.model, MAX_MODEL_FIELD_CHARS + 1), false);
	assert.equal(acceptsLength(agent.cwd, MAX_PATH_FIELD_CHARS), true);
	assert.equal(acceptsLength(agent.cwd, MAX_PATH_FIELD_CHARS + 1), false);
	assert.equal(acceptsLength(library.query, MAX_SHORT_TEXT_FIELD_CHARS), true);
	assert.equal(acceptsLength(library.query, MAX_SHORT_TEXT_FIELD_CHARS + 1), false);
});

test("AgentTeamSchema documents explicit per-step timeout default and bounds", () => {
	const timeoutSecondsPerStep = AgentTeamSchema.properties.limits.properties.timeoutSecondsPerStep;
	assert.equal(timeoutSecondsPerStep.minimum, 1);
	assert.equal(timeoutSecondsPerStep.maximum, MAX_TIMEOUT_SECONDS_PER_STEP);
	assert.equal(timeoutSecondsPerStep.default, DEFAULT_TIMEOUT_SECONDS_PER_STEP);
});

test("normalizeLimits applies the explicit per-step timeout default", () => {
	const defaults = normalizeLimits({ action: "run", objective: "ok", steps: [{ id: "s", agent: "package:reviewer", task: "x" }] });
	const override = normalizeLimits({ action: "run", objective: "ok", steps: [{ id: "s", agent: "package:reviewer", task: "x" }], limits: { concurrency: 1, timeoutSecondsPerStep: 9000 } });
	assert.equal(defaults.concurrency, MAX_CONCURRENCY);
	assert.equal(defaults.timeoutSecondsPerStep, DEFAULT_TIMEOUT_SECONDS_PER_STEP);
	assert.equal(override.concurrency, 1);
	assert.equal(override.timeoutSecondsPerStep, 9000);
});

test("AgentTeamSchema retires caller-selected upstream handoff policy", () => {
	const step = AgentTeamSchema.properties.steps.items.properties;
	const synthesis = AgentTeamSchema.properties.synthesis.properties;
	assert.equal(Object.prototype.hasOwnProperty.call(step, "upstream"), false);
	assert.equal(Object.prototype.hasOwnProperty.call(synthesis, "upstream"), false);
});

test("AgentTeamSchema separates built-in tools from extension tool grants", () => {
	const validate = Compile(AgentTeamSchema);
	const builtIn = { action: "run", objective: "ok", agents: [{ id: "reader", kind: "inline", system: "x", tools: ["read"] }], steps: [{ id: "s", agent: "reader", task: "x" }] };
	const retiredShape = { action: "run", objective: "bad", agents: [{ id: "searcher", kind: "inline", system: "x", tools: ["exa_search"] }], steps: [{ id: "s", agent: "searcher", task: "x" }] };
	const extensionGrant = { action: "run", objective: "ok", agents: [{ id: "searcher", kind: "inline", system: "x", extensionTools: [{ name: "exa_search", from: { source: "npm:pi-exa-tools", scope: "user", origin: "package" } }] }], steps: [{ id: "s", agent: "searcher", task: "x" }] };
	const extraProperty = { action: "run", objective: "bad", agents: [{ id: "searcher", kind: "inline", system: "x", extensionTools: [{ name: "exa_search", from: { source: "npm:pi-exa-tools", path: "/tmp/extension.ts" } }] }], steps: [{ id: "s", agent: "searcher", task: "x" }] };
	assert.equal(validate.Check(builtIn), true);
	assert.equal(validate.Check(retiredShape), false);
	assert.equal(validate.Check(extensionGrant), true);
	assert.equal(validate.Check(extraProperty), false);
});
