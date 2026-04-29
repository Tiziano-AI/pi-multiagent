import assert from "node:assert/strict";
import test from "node:test";
import { prepareLibraryOptions } from "../extensions/multiagent/src/library-policy.ts";

test("prepareLibraryOptions denies project confirmation when UI is unavailable", async () => {
	const result = await prepareLibraryOptions(
		{ action: "catalog", library: { sources: ["package", "project"], projectAgents: "confirm" } },
		{ hasUI: false, confirmProjectAgents: undefined },
	);
	assert.deepEqual(result.library.sources, ["package"]);
	assert.equal(result.library.projectAgents, "deny");
	assert.equal(result.diagnostics[0].code, "project-agents-confirm-unavailable");
});

test("prepareLibraryOptions respects UI denial and approval", async () => {
	const denied = await prepareLibraryOptions(
		{ action: "catalog", library: { sources: ["project"], projectAgents: "confirm" } },
		{ hasUI: true, confirmProjectAgents: async () => false },
	);
	assert.deepEqual(denied.library.sources, []);
	assert.equal(denied.library.projectAgents, "deny");
	assert.equal(denied.diagnostics[0].code, "project-agents-confirm-denied");
	const approved = await prepareLibraryOptions(
		{ action: "catalog", library: { sources: ["project"], projectAgents: "confirm" } },
		{ hasUI: true, confirmProjectAgents: async () => true },
	);
	assert.deepEqual(approved.library.sources, ["project"]);
	assert.equal(approved.library.projectAgents, "allow");
	assert.equal(approved.diagnostics[0].code, "project-agents-confirm-approved");
});

test("prepareLibraryOptions fails closed when project confirmation throws", async () => {
	const result = await prepareLibraryOptions(
		{ action: "catalog", library: { sources: ["project"], projectAgents: "confirm" } },
		{
			hasUI: true,
			confirmProjectAgents: async () => {
				throw new Error("ui unavailable");
			},
			projectAgentsDir: "/tmp/project/.pi/agents",
		},
	);
	assert.deepEqual(result.library.sources, []);
	assert.equal(result.library.projectAgents, "deny");
	assert.equal(result.diagnostics[0].code, "project-agents-confirm-failed");
	assert.equal(result.diagnostics[0].path, "/tmp/project/.pi/agents");
});

test("prepareLibraryOptions skips project confirmation when preflight is blocked", async () => {
	let prompted = false;
	const result = await prepareLibraryOptions(
		{ action: "catalog", library: { sources: ["project"], projectAgents: "confirm" } },
		{
			hasUI: true,
			confirmProjectAgents: async () => {
				prompted = true;
				return true;
			},
			confirmationBlockedReason: "the request failed shape preflight",
		},
	);
	assert.equal(prompted, false);
	assert.deepEqual(result.library.sources, []);
	assert.equal(result.library.projectAgents, "deny");
	assert.equal(result.diagnostics[0].code, "project-agents-confirm-skipped");
});
