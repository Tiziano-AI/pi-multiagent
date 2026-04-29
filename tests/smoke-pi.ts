import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import multiagentExtension from "../extensions/multiagent/index.ts";
import { discoverAgents, normalizeLibraryOptions } from "../extensions/multiagent/src/agents.ts";
import { runAgentTeam } from "../extensions/multiagent/src/delegation.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const library = normalizeLibraryOptions({ sources: ["package"] });
const discovery = discoverAgents({ cwd: packageRoot, packageAgentsDir: join(packageRoot, "agents"), library });

interface RegisteredTool {
	name: string;
	execute: (toolCallId: string, params: object, signal: AbortSignal | undefined, onUpdate: unknown, ctx: object) => Promise<{ content: { type: string; text: string }[] }>;
}

const tools: RegisteredTool[] = [];
multiagentExtension({
	registerTool(tool: RegisteredTool) {
		tools.push(tool);
	},
	getThinkingLevel() {
		return undefined;
	},
});
const tool = tools.find((candidate) => candidate.name === "agent_team");
assert.ok(tool);

const catalog = await tool.execute(
	"smoke-catalog",
	{ action: "catalog", library: { sources: ["package"], query: "review" } },
	undefined,
	undefined,
	{ cwd: packageRoot, hasUI: false, model: undefined, ui: { confirm: async () => false } },
);
assert.equal(catalog.content[0].text.includes("package:reviewer"), true);

let confirmed = false;
const invalidRun = await tool.execute(
	"smoke-invalid-run",
	{ action: "run", library: { sources: ["project"], projectAgents: "confirm" }, steps: [{ id: "s", agent: "package:worker", task: "x" }] },
	undefined,
	undefined,
	{
		cwd: packageRoot,
		hasUI: true,
		model: undefined,
		ui: {
			confirm: async () => {
				confirmed = true;
				return true;
			},
		},
	},
);
assert.equal(confirmed, false);
assert.equal(invalidRun.content[0].text.startsWith("# agent_team error"), true);
assert.equal(invalidRun.content[0].text.includes("project-agents-confirm-skipped"), true);

const approvedProjectCatalog = await tool.execute(
	"smoke-confirm",
	{ action: "catalog", library: { sources: ["project"], projectAgents: "confirm" } },
	undefined,
	undefined,
	{ cwd: packageRoot, hasUI: true, model: undefined, ui: { confirm: async () => true } },
);
assert.equal(approvedProjectCatalog.content[0].text.includes("project-agents-confirm-approved"), true);

class FakeChild extends EventEmitter {
	stdin = new PassThrough();
	stdout = new PassThrough();
	stderr = new PassThrough();
	exitCode: number | null = null;
	kill(): boolean {
		return true;
	}
	close(code: number): void {
		this.exitCode = code;
		this.emit("close", code, null);
	}
}

const tasks: string[] = [];
const result = await runAgentTeam(
	{
		action: "run",
		objective: "smoke run",
		agents: [{ id: "worker", kind: "inline", system: "Return smoke-ok." }],
		steps: [{ id: "step", agent: "worker", task: "smoke task" }],
	},
	{
		cwd: packageRoot,
		discovery,
		library,
		defaults: { model: undefined, thinking: undefined },
		signal: undefined,
		onUpdate: undefined,
		spawnProcess: (_command, args, options) => {
			assert.equal(args.includes("smoke task"), false);
			assert.equal(options.shell, false);
			assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe"]);
			assert.equal(args.includes("--no-session"), true);
			assert.equal(args.includes("--no-extensions"), true);
			assert.equal(args.includes("--no-context-files"), true);
			const child = new FakeChild();
			let task = "";
			child.stdin.on("data", (chunk: Buffer) => {
				task += chunk.toString("utf8");
			});
			child.stdin.on("end", () => tasks.push(task));
			queueMicrotask(() => {
				child.stdout.write(`${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "smoke-ok" }], stopReason: "stop" } })}\n`);
				child.close(0);
			});
			return child;
		},
	},
);
assert.equal(result.details.steps[0].status, "succeeded");
assert.equal(result.content[0].text.includes("smoke-ok"), true);
assert.equal(tasks[0].includes("smoke task"), true);
