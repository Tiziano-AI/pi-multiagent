import assert from "node:assert/strict";
import test from "node:test";
import { AgentTeamSchema } from "../extensions/multiagent/src/schemas.ts";
import { MAX_MODEL_FIELD_CHARS, MAX_PATH_FIELD_CHARS, MAX_SHORT_TEXT_FIELD_CHARS, MAX_TEXT_FIELD_CHARS, MAX_UPSTREAM_CHARS } from "../extensions/multiagent/src/types.ts";

function acceptsLength(schema: { minLength?: number; maxLength?: number }, length: number): boolean {
	const min = schema.minLength ?? 0;
	const max = schema.maxLength ?? Number.POSITIVE_INFINITY;
	return length >= min && length <= max;
}

function acceptsNumber(schema: { minimum?: number; maximum?: number }, value: number): boolean {
	const minimum = schema.minimum ?? Number.NEGATIVE_INFINITY;
	const maximum = schema.maximum ?? Number.POSITIVE_INFINITY;
	return value >= minimum && value <= maximum;
}

test("AgentTeamSchema bounds caller text field lengths", () => {
	const root = AgentTeamSchema.properties;
	const library = root.library.properties;
	const agent = root.agents.items.properties;
	const step = root.steps.items.properties;
	const synthesis = root.synthesis.properties;

	assert.equal(root.objective.maxLength, MAX_TEXT_FIELD_CHARS);
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

	assert.equal(acceptsLength(step.task, MAX_TEXT_FIELD_CHARS), true);
	assert.equal(acceptsLength(step.task, MAX_TEXT_FIELD_CHARS + 1), false);
	assert.equal(acceptsLength(agent.model, MAX_MODEL_FIELD_CHARS), true);
	assert.equal(acceptsLength(agent.model, MAX_MODEL_FIELD_CHARS + 1), false);
	assert.equal(acceptsLength(agent.cwd, MAX_PATH_FIELD_CHARS), true);
	assert.equal(acceptsLength(agent.cwd, MAX_PATH_FIELD_CHARS + 1), false);
	assert.equal(acceptsLength(library.query, MAX_SHORT_TEXT_FIELD_CHARS), true);
	assert.equal(acceptsLength(library.query, MAX_SHORT_TEXT_FIELD_CHARS + 1), false);
});

test("AgentTeamSchema bounds upstream maxChars", () => {
	const upstream = AgentTeamSchema.properties.steps.items.properties.upstream.properties;
	assert.equal(upstream.maxChars.maximum, MAX_UPSTREAM_CHARS);
	assert.equal(acceptsNumber(upstream.maxChars, MAX_UPSTREAM_CHARS), true);
	assert.equal(acceptsNumber(upstream.maxChars, MAX_UPSTREAM_CHARS + 1), false);
});
