import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
await loadPackageRoot(packageRoot, "source tree");

const packedRoot = await mkdtemp(join(tmpdir(), "pi-multiagent-pack-load-"));
try {
	const pack = spawnSync("npm", ["pack", "--pack-destination", packedRoot, "--json"], { cwd: packageRoot, encoding: "utf8" });
	if (pack.stderr.length > 0) process.stderr.write(pack.stderr);
	assert.equal(pack.status, 0, pack.error?.message ?? pack.stderr);
	const tarballPath = parsePackTarballPath(pack.stdout, packedRoot);
	const extract = spawnSync("tar", ["-xzf", tarballPath, "-C", packedRoot], { cwd: packedRoot, encoding: "utf8" });
	if (extract.stderr.length > 0) process.stderr.write(extract.stderr);
	assert.equal(extract.status, 0, extract.error?.message ?? extract.stderr);
	await loadPackageRoot(join(packedRoot, "package"), "packed artifact");
} finally {
	await rm(packedRoot, { recursive: true, force: true });
}

interface RegisteredTool {
	name: string;
	description?: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	execute: (toolCallId: string, params: object, signal: AbortSignal | undefined, onUpdate: unknown, ctx: object) => Promise<{ content: { type: string; text: string }[] }>;
}

async function loadPackageRoot(root: string, label: string): Promise<void> {
	const rawPackage: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
	if (!isRecord(rawPackage)) throw new Error(`${label}: package.json should parse to an object`);
	const pi = rawPackage.pi;
	if (!isRecord(pi)) throw new Error(`${label}: package.json should contain pi metadata`);
	const extensions = pi.extensions;
	assert.equal(Array.isArray(extensions), true, `${label}: pi.extensions should be an array`);
	assert.equal(extensions.length > 0, true, `${label}: pi.extensions should not be empty`);
	await assertSkillManifest(root, label, pi.skills);

	for (const [index, extensionPath] of extensions.entries()) {
		assert.equal(typeof extensionPath, "string", `${label}: extension path should be a string`);
		const moduleUrl = pathToFileURL(join(root, extensionPath)).href;
		const moduleRecord: unknown = await import(`${moduleUrl}?load=${encodeURIComponent(label)}-${index}`);
		assert.equal(isRecord(moduleRecord) && "default" in moduleRecord, true, `${label}: ${extensionPath} should export a default Pi extension function`);
		const extension = moduleRecord.default;
		assert.equal(typeof extension, "function", `${label}: ${extensionPath} default export should be a Pi extension function`);
		const tools: RegisteredTool[] = [];
		const flagValues = new Map<string, boolean | string>();
		extension({
			on() {},
			registerMessageRenderer() {},
			registerFlag(name: string, options: { default?: boolean | string }) {
				if (options.default !== undefined) flagValues.set(name, options.default);
			},
			getFlag(name: string) {
				return flagValues.get(name);
			},
			registerTool(tool: RegisteredTool) {
				tools.push(tool);
			},
			sendMessage() {},
			getThinkingLevel() {
				return undefined;
			},
		});
		const tool = tools.find((candidate) => candidate.name === "agent_team");
		assert.ok(tool, `${label}: ${extensionPath} should register agent_team`);
		assert.equal(flagValues.get("agent-team-subagent-skills"), "enabled", `${label}: ${extensionPath} should default subagent skills to enabled`);
		assert.match(tool.description ?? "", /step_result.*one step/);
		assert.equal((tool.description ?? "").length < 1400, true, `${label}: agent_team description should stay compact`);
		assert.equal((tool.promptGuidelines ?? []).join("\n").length < 3600, true, `${label}: agent_team prompt guidelines should stay within model-facing budget`);
		const modelGuidance = `${tool.description ?? ""}\n${(tool.promptGuidelines ?? []).join("\n")}`;
		assert.match(modelGuidance, /suppressed non-error activity/, `${label}: agent_team should expose suppressed UI semantics`);
		assert.match(modelGuidance, /structured wait receipt/, `${label}: agent_team should expose wait receipt semantics`);
		assert.match(modelGuidance, /accepted-for-delivery receipts prove only Pi accepted live-child transport/, `${label}: agent_team should expose transport-only message receipt semantics`);
		assert.match(modelGuidance, /routine assistant\/tool\/UI activity/, `${label}: agent_team should describe which live activity does not wake run_status waits`);
		assert.match(tool.promptSnippet ?? "", /catalog.*start.*run_status.*step_result.*message.*cancel.*cleanup/);
		assert.equal(tool.promptGuidelines?.some((line) => /Action decision tree/.test(line) && /step_result.*exactly one step/.test(line)), true, `${label}: agent_team should expose a compact action decision tree`);
		const catalog = await tool.execute(
			`${label}-catalog`,
			{ action: "catalog", library: { sources: ["package"], query: "review" } },
			undefined,
			undefined,
			extensionCtx(root),
		);
		assert.equal(catalog.content[0].text.includes("package:reviewer"), true, `${label}: catalog should include package:reviewer`);
		const webCatalog = await tool.execute(
			`${label}-web-catalog`,
			{ action: "catalog", library: { sources: ["package"], query: "web research" } },
			undefined,
			undefined,
			extensionCtx(root),
		);
		assert.equal(webCatalog.content[0].text.includes("package:web-researcher"), true, `${label}: catalog should include package:web-researcher`);
		const validationCatalog = await tool.execute(
			`${label}-validation-catalog`,
			{ action: "catalog", library: { sources: ["package"], query: "run validation commands" } },
			undefined,
			undefined,
			extensionCtx(root),
		);
		assert.equal(validationCatalog.content[0].text.includes("package:validator"), true, `${label}: catalog should include package:validator`);
	}
}

function extensionCtx(root: string): object {
	return { cwd: root, hasUI: false, model: undefined, sessionManager: { getSessionId: () => `load-${root}` }, ui: { confirm: async () => false } };
}

async function assertSkillManifest(root: string, label: string, skills: unknown): Promise<void> {
	assert.equal(Array.isArray(skills), true, `${label}: pi.skills should be an array`);
	assert.equal((skills as unknown[]).includes("./skills"), true, `${label}: pi.skills should include ./skills`);
	const skill = await readFile(join(root, "skills", "pi-multiagent", "SKILL.md"), "utf8");
	const frontmatter = skill.split("---", 3)[1] ?? "";
	assert.match(frontmatter, /^name: pi-multiagent$/m, `${label}: pi-multiagent skill should declare frontmatter name`);
	assert.match(skill, /references\/graph-cookbook\.md/, `${label}: pi-multiagent skill should reference the graph cookbook`);
	await readFile(join(root, "skills", "pi-multiagent", "references", "graph-cookbook.md"), "utf8");
}

function parsePackTarballPath(stdout: string, destination: string): string {
	const parsed: unknown = JSON.parse(stdout.trim());
	assert.equal(typeof parsed === "object" && parsed !== null, true, "npm pack did not emit JSON");
	const manifest: unknown = Array.isArray(parsed) ? parsed[0] : Object.values(parsed as Record<string, unknown>)[0];
	if (!isRecord(manifest)) throw new Error("npm pack entry should be an object");
	assert.equal(typeof manifest.filename, "string", "npm pack entry should include filename");
	return join(destination, manifest.filename);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
