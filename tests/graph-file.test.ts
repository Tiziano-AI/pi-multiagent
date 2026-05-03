import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { materializeAgentTeamInput } from "../extensions/multiagent/src/graph-file.ts";
import { MAX_DEPENDENCIES_PER_STEP, MAX_GRAPH_FILE_BYTES } from "../extensions/multiagent/src/types.ts";

test("materializeAgentTeamInput loads a relative JSON run graph", async () => {
	const root = await mkdir(join(tmpdir(), `pi-multiagent-graph-file-${Date.now()}`), { recursive: true });
	try {
		await writeFile(join(root, "graph.json"), JSON.stringify({ action: "run", objective: "from file", steps: [{ id: "one", agent: "package:reviewer", task: "review" }] }), "utf8");
		const materialized = materializeAgentTeamInput({ action: "run", graphFile: "graph.json" }, root);
		assert.equal(materialized.diagnostics.length, 0);
		assert.equal(materialized.input.objective, "from file");
		assert.equal(materialized.input.steps?.[0]?.id, "one");
		assert.equal(materialized.input.graphFile, undefined);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("materializeAgentTeamInput rejects graphFile mixed with inline run fields", async () => {
	const root = await mkdir(join(tmpdir(), `pi-multiagent-graph-file-mixed-${Date.now()}`), { recursive: true });
	try {
		await writeFile(join(root, "graph.json"), JSON.stringify({ action: "run", objective: "from file", steps: [{ id: "one", agent: "package:reviewer", task: "review" }] }), "utf8");
		const materialized = materializeAgentTeamInput({ action: "run", graphFile: "graph.json", objective: "inline", extensionToolPolicy: { localExtensions: "allow" }, callerSkills: "none", steps: [{ id: "inline", agent: "package:reviewer", task: "review" }] }, root);
		assert.equal(materialized.input.graphFile, "graph.json");
		assert.equal(materialized.diagnostics.some((item) => item.code === "graph-file-inline-fields-denied" && item.message.includes("extensionToolPolicy")), true);
		assert.equal(materialized.diagnostics.some((item) => item.code === "graph-file-inline-fields-denied" && item.message.includes("callerSkills")), true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("materializeAgentTeamInput rejects path escapes, symlinks, and nested graphFile", async () => {
	const parent = await mkdir(join(tmpdir(), `pi-multiagent-graph-file-deny-${Date.now()}`), { recursive: true });
	const root = await mkdir(join(parent, "root"), { recursive: true });
	try {
		await writeFile(join(root, "nested.json"), JSON.stringify({ action: "run", graphFile: "other.json" }), "utf8");
		await writeFile(join(parent, "external.json"), JSON.stringify({ action: "run", objective: "external", steps: [{ id: "one", agent: "package:reviewer", task: "review" }] }), "utf8");
		await symlink(join(parent, "external.json"), join(root, "link.json"));

		const escape = materializeAgentTeamInput({ action: "run", graphFile: "../external.json" }, root);
		assert.equal(escape.diagnostics.some((item) => item.code === "graph-file-path-escape-denied"), true);

		const linked = materializeAgentTeamInput({ action: "run", graphFile: "link.json" }, root);
		assert.equal(linked.diagnostics.some((item) => item.code === "graph-file-symlink-denied"), true);

		const nested = materializeAgentTeamInput({ action: "run", graphFile: "nested.json" }, root);
		assert.equal(nested.diagnostics.some((item) => item.code === "graph-file-nested-denied"), true);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("materializeAgentTeamInput schema-validates graphFile contents", async () => {
	const root = await mkdir(join(tmpdir(), `pi-multiagent-graph-file-schema-${Date.now()}`), { recursive: true });
	try {
		await writeFile(join(root, "invalid.json"), JSON.stringify({ action: "run", objective: "invalid", steps: "not-array" }), "utf8");
		await writeFile(join(root, "retired.json"), JSON.stringify({ action: "run", objective: "retired", steps: [{ id: "one", agent: "package:reviewer", task: "review", upstream: { mode: "full" } }] }), "utf8");
		await writeFile(join(root, "dependency-bounds.json"), JSON.stringify({ action: "run", objective: "bounds", steps: [{ id: "one", agent: "package:reviewer", task: "review", needs: Array.from({ length: MAX_DEPENDENCIES_PER_STEP + 1 }, () => "dep") }] }), "utf8");
		await writeFile(join(root, "timeout-bounds.json"), JSON.stringify({ action: "run", objective: "bounds", steps: [{ id: "one", agent: "package:reviewer", task: "review" }], limits: { timeoutSecondsPerStep: 0 } }), "utf8");
		await writeFile(join(root, "extension-tools.json"), JSON.stringify({ action: "run", objective: "extension", callerSkills: { include: ["pi-multiagent"] }, agents: [{ id: "web", kind: "inline", system: "x", callerSkills: "none", extensionTools: [{ name: "exa_search", from: { source: "npm:pi-exa-tools", scope: "user", origin: "package" } }] }], steps: [{ id: "one", agent: "web", task: "review" }] }), "utf8");
		await writeFile(join(root, "too-large.json"), "x".repeat(MAX_GRAPH_FILE_BYTES + 1), "utf8");

		const invalid = materializeAgentTeamInput({ action: "run", graphFile: "invalid.json" }, root);
		assert.equal(invalid.diagnostics.some((item) => item.code === "graph-file-schema-invalid" && item.path === "/graphFile/steps"), true);

		const retired = materializeAgentTeamInput({ action: "run", graphFile: "retired.json" }, root);
		assert.equal(retired.diagnostics.some((item) => item.code === "graph-file-schema-invalid" && item.path === "/graphFile/steps/0"), true);

		const dependencyBounds = materializeAgentTeamInput({ action: "run", graphFile: "dependency-bounds.json" }, root);
		assert.equal(dependencyBounds.diagnostics.some((item) => item.code === "graph-file-schema-invalid" && item.path === "/graphFile/steps/0/needs"), true);

		const timeoutBounds = materializeAgentTeamInput({ action: "run", graphFile: "timeout-bounds.json" }, root);
		assert.equal(timeoutBounds.diagnostics.some((item) => item.code === "graph-file-schema-invalid" && item.path === "/graphFile/limits/timeoutSecondsPerStep"), true);

		const extensionTools = materializeAgentTeamInput({ action: "run", graphFile: "extension-tools.json" }, root);
		assert.equal(extensionTools.diagnostics.length, 0);
		assert.deepEqual(extensionTools.input.callerSkills, { include: ["pi-multiagent"] });
		assert.equal(extensionTools.input.agents?.[0]?.callerSkills, "none");
		assert.equal(extensionTools.input.agents?.[0]?.extensionTools?.[0]?.name, "exa_search");

		const tooLarge = materializeAgentTeamInput({ action: "run", graphFile: "too-large.json" }, root);
		assert.equal(tooLarge.diagnostics.some((item) => item.code === "graph-file-too-large"), true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
