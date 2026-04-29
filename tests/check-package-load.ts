import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const rawPackage = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
assert.equal(typeof rawPackage === "object" && rawPackage !== null, true);
assert.equal(typeof rawPackage.pi === "object" && rawPackage.pi !== null, true);
assert.equal(Array.isArray(rawPackage.pi.extensions), true);
assert.equal(rawPackage.pi.extensions.length > 0, true);

interface RegisteredTool {
	name: string;
	execute: (toolCallId: string, params: object, signal: AbortSignal | undefined, onUpdate: unknown, ctx: object) => Promise<{ content: { type: string; text: string }[] }>;
}

for (const extensionPath of rawPackage.pi.extensions) {
	assert.equal(typeof extensionPath, "string");
	const moduleUrl = pathToFileURL(join(packageRoot, extensionPath)).href;
	const moduleRecord: unknown = await import(moduleUrl);
	assert.equal(typeof moduleRecord === "object" && moduleRecord !== null && "default" in moduleRecord, true);
	const extension = moduleRecord.default;
	assert.equal(typeof extension, "function", `${extensionPath} default export should be a Pi extension function`);
	const tools: RegisteredTool[] = [];
	extension({
		registerTool(tool: RegisteredTool) {
			tools.push(tool);
		},
		getThinkingLevel() {
			return undefined;
		},
	});
	const tool = tools.find((candidate) => candidate.name === "agent_team");
	assert.ok(tool, `${extensionPath} should register agent_team`);
	const catalog = await tool.execute(
		"package-load-catalog",
		{ action: "catalog", library: { sources: ["package"], query: "review" } },
		undefined,
		undefined,
		{ cwd: packageRoot, hasUI: false, model: undefined, ui: { confirm: async () => false } },
	);
	assert.equal(catalog.content[0].text.includes("package:reviewer"), true);
}
