import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { catalogAgents, discoverAgents, findNearestProjectAgentsDir, normalizeLibraryOptions } from "../extensions/multiagent/src/agents.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function makeAgent(dir: string, file: string, body: string): Promise<void> {
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, file), body, "utf8");
}

test("discoverAgents preserves source-qualified refs across sources", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-agents-"));
	const packageDir = join(root, "package-agents");
	const userDir = join(root, "user-agents");
	await makeAgent(packageDir, "scout.md", "---\nname: scout\ndescription: package scout\ntools: read, grep\n---\nPackage prompt");
	await makeAgent(userDir, "scout.md", "---\nname: scout\ndescription: user scout\n---\nUser prompt");
	const discovery = discoverAgents({
		cwd: root,
		packageAgentsDir: packageDir,
		userAgentsDir: userDir,
		library: normalizeLibraryOptions({ sources: ["package", "user"] }),
	});
	assert.deepEqual(discovery.agents.map((agent) => agent.ref), ["package:scout", "user:scout"]);
	assert.equal(discovery.agents.find((agent) => agent.ref === "user:scout")?.description, "user scout");
	await rm(root, { recursive: true, force: true });
});

test("discoverAgents parses CRLF frontmatter", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-crlf-"));
	const packageDir = join(root, "package-agents");
	await makeAgent(packageDir, "crlf.md", "---\r\nname: crlf\r\ndescription: windows newlines\r\n---\r\nPrompt");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, library: normalizeLibraryOptions({ sources: ["package"] }) });
	assert.equal(discovery.agents[0]?.name, "crlf");
	assert.equal(discovery.agents[0]?.systemPrompt, "Prompt");
	await rm(root, { recursive: true, force: true });
});

test("discoverAgents reports invalid agent definitions", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-invalid-"));
	const packageDir = join(root, "package-agents");
	await makeAgent(packageDir, "bad.md", "---\nname: Bad Name\ndescription: bad\nthinking: sideways\n---\nNope");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, library: normalizeLibraryOptions({ sources: ["package"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.length, 1);
	assert.equal(discovery.diagnostics[0].code, "agent-name-invalid");
	await rm(root, { recursive: true, force: true });
});

test("discoverAgents rejects invalid library-declared tools", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-invalid-tools-"));
	const packageDir = join(root, "package-agents");
	await makeAgent(packageDir, "bad-tools.md", "---\nname: bad-tools\ndescription: bad tools\ntools: read, bad/tool\n---\nNope");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, library: normalizeLibraryOptions({ sources: ["package"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics[0].code, "agent-tools-invalid");
	await rm(root, { recursive: true, force: true });
});

test("discoverAgents rejects unavailable library-declared tools", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-unavailable-tools-"));
	const packageDir = join(root, "package-agents");
	await makeAgent(packageDir, "bad-tools.md", "---\nname: bad-tools\ndescription: bad tools\ntools: read, webFetch\n---\nNope");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, library: normalizeLibraryOptions({ sources: ["package"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "agent-tool-invalid" && item.message.includes("webFetch")), true);
	await rm(root, { recursive: true, force: true });
});

test("discoverAgents reports duplicate source refs only", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-duplicate-refs-"));
	const packageDir = join(root, "package-agents");
	await makeAgent(packageDir, "one.md", "---\nname: dup\ndescription: one\n---\nOne");
	await makeAgent(packageDir, "two.md", "---\nname: dup\ndescription: two\n---\nTwo");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, library: normalizeLibraryOptions({ sources: ["package"] }) });
	assert.equal(discovery.agents.length, 1);
	assert.equal(discovery.diagnostics.some((item) => item.code === "agent-ref-duplicate"), true);
	await rm(root, { recursive: true, force: true });
});

test("global Pi directory is not treated as project agents or project-scoped user agents", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-global-pi-"));
	const globalPiDir = join(root, ".pi");
	const userDir = join(globalPiDir, "agent", "agents");
	const packageDir = join(root, "package-agents");
	const project = join(root, "Code", "repo");
	await mkdir(join(project, ".git"), { recursive: true });
	await makeAgent(userDir, "user.md", "---\nname: user\ndescription: user agent\n---\nUser prompt");
	await makeAgent(join(globalPiDir, "agents"), "global-project.md", "---\nname: global-project\ndescription: not project\n---\nGlobal prompt");
	const projectAgentsDir = findNearestProjectAgentsDir(project, globalPiDir);
	const discovery = discoverAgents({ cwd: project, packageAgentsDir: packageDir, userAgentsDir: userDir, globalPiDir, library: normalizeLibraryOptions({ sources: ["user", "project"], projectAgents: "allow" }) });
	assert.equal(projectAgentsDir, undefined);
	assert.deepEqual(discovery.agents.map((agent) => agent.ref), ["user:user"]);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped"), false);
	await rm(root, { recursive: true, force: true });
});

test("project source is denied by default", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-project-deny-"));
	const packageDir = join(root, "package-agents");
	const projectDir = join(root, ".pi", "agents");
	await makeAgent(projectDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, library: normalizeLibraryOptions({ sources: ["project"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics[0].code, "project-agents-denied");
	await rm(root, { recursive: true, force: true });
});

test("project source confirm fails closed when discovery is not preprocessed", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-project-confirm-"));
	const packageDir = join(root, "package-agents");
	const projectDir = join(root, ".pi", "agents");
	await makeAgent(projectDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, library: normalizeLibraryOptions({ sources: ["project"], projectAgents: "confirm" }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "project-agents-confirm-unprepared" && item.severity === "error"), true);
	await rm(root, { recursive: true, force: true });
});

test("project-scoped user agent directory is denied", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-user-project-scoped-"));
	const packageDir = join(root, "package-agents");
	const userDir = join(root, ".pi", "agents");
	await makeAgent(userDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped" && item.severity === "error"), true);
	await rm(root, { recursive: true, force: true });
});

test("project-root user agent directory is denied", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-user-project-root-"));
	const packageDir = join(root, "package-agents");
	const userDir = join(root, "agents");
	await mkdir(join(root, ".pi"), { recursive: true });
	await makeAgent(userDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped" && item.severity === "error"), true);
	await rm(root, { recursive: true, force: true });
});

test("project-root user agent directory is denied when git marker is a file", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-user-project-git-file-"));
	const packageDir = join(root, "package-agents");
	const userDir = join(root, "agents");
	await writeFile(join(root, ".git"), "gitdir: ../real-git\n", "utf8");
	await makeAgent(userDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped" && item.severity === "error"), true);
	await rm(root, { recursive: true, force: true });
});

test("project-root user agent directory is denied when pi marker is a file or symlink", async () => {
	const cases = ["file", "symlink", "dangling-symlink"] as const;
	for (const markerKind of cases) {
		const root = await mkdtemp(join(tmpdir(), `pi-multiagent-user-project-pi-${markerKind}-`));
		const packageDir = join(root, "package-agents");
		const userDir = join(root, "agents");
		const marker = join(root, ".pi");
		if (markerKind === "file") await writeFile(marker, "settings marker\n", "utf8");
		else if (markerKind === "symlink") {
			const target = join(root, "pi-marker-target");
			await writeFile(target, "settings marker\n", "utf8");
			await symlink(target, marker);
		} else await symlink(join(root, "missing-pi-marker-target"), marker);
		await makeAgent(userDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
		const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
		assert.equal(discovery.agents.length, 0, markerKind);
		assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped" && item.severity === "error"), true, markerKind);
		await rm(root, { recursive: true, force: true });
	}
});

test("project-root user agent directory is denied through symlink", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-user-project-root-link-"));
	const outside = await mkdtemp(join(tmpdir(), "pi-multiagent-user-root-link-outside-"));
	const packageDir = join(root, "package-agents");
	const projectAgents = join(root, "agents");
	const userDir = join(outside, "agents-link");
	await mkdir(join(root, ".pi"), { recursive: true });
	await makeAgent(projectAgents, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	await symlink(projectAgents, userDir);
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped" && item.severity === "error"), true);
	await rm(root, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
});

test("nested project-scoped user agent directory is denied without project agents dir", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-user-project-nested-"));
	const packageDir = join(root, "package-agents");
	const nested = join(root, "src");
	const userDir = join(root, ".pi", "agent", "agents");
	await mkdir(nested, { recursive: true });
	await makeAgent(userDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	const discovery = discoverAgents({ cwd: nested, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped" && item.severity === "error"), true);
	await rm(root, { recursive: true, force: true });
});

test("nested project-scoped user agent directory is denied through cwd symlink", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-user-project-nested-link-"));
	const outside = await mkdtemp(join(tmpdir(), "pi-multiagent-user-project-nested-outside-"));
	const packageDir = join(root, "package-agents");
	const nested = join(root, "src");
	const linkedNested = join(outside, "linked-src");
	const userDir = join(root, ".pi", "agent", "agents");
	await mkdir(nested, { recursive: true });
	await makeAgent(userDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	await symlink(nested, linkedNested, "dir");
	const discovery = discoverAgents({ cwd: linkedNested, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped" && item.severity === "error"), true);
	await rm(root, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
});

test("project-scoped user agent directory is denied through symlink", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-user-project-symlink-"));
	const outside = await mkdtemp(join(tmpdir(), "pi-multiagent-user-link-"));
	const packageDir = join(root, "package-agents");
	const projectDir = join(root, ".pi", "agents");
	const userDir = join(outside, "agents-link");
	await makeAgent(projectDir, "repo.md", "---\nname: repo\ndescription: repo agent\n---\nRepo prompt");
	await symlink(projectDir, userDir);
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agents-dir-project-scoped" && item.severity === "error"), true);
	await rm(root, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
});

test("user agent file symlinks are denied", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-user-file-symlink-"));
	const outside = await mkdtemp(join(tmpdir(), "pi-multiagent-user-file-outside-"));
	const packageDir = join(root, "package-agents");
	const userDir = join(root, "user-agents");
	await mkdir(userDir, { recursive: true });
	await writeFile(join(outside, "linked.md"), "---\nname: linked\ndescription: linked agent\n---\nLinked prompt", "utf8");
	await symlink(join(outside, "linked.md"), join(userDir, "linked.md"));
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, userAgentsDir: userDir, library: normalizeLibraryOptions({ sources: ["user"] }) });
	assert.equal(discovery.agents.length, 0);
	assert.equal(discovery.diagnostics.some((item) => item.code === "user-agent-symlink-denied"), true);
	await rm(root, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
});

test("project agents deny symlinks and keep source-qualified refs", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-project-policy-"));
	const outside = await mkdtemp(join(tmpdir(), "pi-multiagent-outside-"));
	const packageDir = join(root, "package-agents");
	const projectDir = join(root, ".pi", "agents");
	await makeAgent(packageDir, "reviewer.md", "---\nname: reviewer\ndescription: package reviewer\n---\nPackage prompt");
	await makeAgent(projectDir, "reviewer.md", "---\nname: reviewer\ndescription: project reviewer\n---\nProject prompt");
	await writeFile(join(outside, "external.md"), "---\nname: external\ndescription: external\n---\nExternal prompt", "utf8");
	await symlink(join(outside, "external.md"), join(projectDir, "external.md"));
	const discovery = discoverAgents({
		cwd: root,
		packageAgentsDir: packageDir,
		library: normalizeLibraryOptions({ sources: ["package", "project"], projectAgents: "allow" }),
	});
	assert.deepEqual(discovery.agents.map((agent) => `${agent.source}:${agent.name}`), ["package:reviewer", "project:reviewer"]);
	assert.equal(discovery.diagnostics.some((item) => item.code === "project-agent-symlink-denied"), true);
	await rm(root, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
});

test("project agents deny symlinked agents directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-project-dir-symlink-"));
	const outside = await mkdtemp(join(tmpdir(), "pi-multiagent-project-dir-outside-"));
	const packageDir = join(root, "package-agents");
	await mkdir(join(root, ".pi"), { recursive: true });
	await makeAgent(outside, "evil.md", "---\nname: evil\ndescription: outside agent\n---\nOutside prompt");
	await symlink(outside, join(root, ".pi", "agents"));
	const discovery = discoverAgents({
		cwd: root,
		packageAgentsDir: packageDir,
		library: normalizeLibraryOptions({ sources: ["project"], projectAgents: "allow" }),
	});
	assert.deepEqual(discovery.agents, []);
	assert.equal(discovery.diagnostics.some((item) => item.code === "project-agent-dir-symlink-denied"), true);
	await rm(root, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
});

test("project agents deny symlinked intermediate pi directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-project-pi-symlink-"));
	const outside = await mkdtemp(join(tmpdir(), "pi-multiagent-project-pi-outside-"));
	const packageDir = join(root, "package-agents");
	await makeAgent(join(outside, "agents"), "evil.md", "---\nname: evil\ndescription: outside agent\n---\nOutside prompt");
	await symlink(outside, join(root, ".pi"), "dir");
	assert.equal(findNearestProjectAgentsDir(root), undefined);
	const discovery = discoverAgents({
		cwd: root,
		packageAgentsDir: packageDir,
		library: normalizeLibraryOptions({ sources: ["project"], projectAgents: "allow" }),
	});
	assert.deepEqual(discovery.agents, []);
	await rm(root, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
});

test("findNearestProjectAgentsDir walks upward", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-project-"));
	const projectAgents = join(root, ".pi", "agents");
	const nested = join(root, "src", "feature");
	await mkdir(projectAgents, { recursive: true });
	await mkdir(nested, { recursive: true });
	assert.equal(findNearestProjectAgentsDir(nested), projectAgents);
	await rm(root, { recursive: true, force: true });
});

test("bundled package agents are valid", () => {
	const discovery = discoverAgents({ cwd: packageRoot, packageAgentsDir: join(packageRoot, "agents"), library: normalizeLibraryOptions({ sources: ["package"] }) });
	assert.deepEqual(discovery.diagnostics, []);
	assert.deepEqual(
		discovery.agents.map((agent) => agent.name),
		["critic", "planner", "reviewer", "scout", "synthesizer", "worker"],
	);
	assert.equal(discovery.agents.every((agent) => agent.sha256.length === 64), true);
});

test("bundled package catalog supports documented role queries", () => {
	const discovery = discoverAgents({ cwd: packageRoot, packageAgentsDir: join(packageRoot, "agents"), library: normalizeLibraryOptions({ sources: ["package"] }) });
	const expectations = new Map([
		["scout", "package:scout"],
		["planner", "package:planner"],
		["critic", "package:critic"],
		["risk", "package:critic"],
		["reviewer", "package:reviewer"],
		["worker", "package:worker"],
		["synthesizer", "package:synthesizer"],
		["synthesis", "package:synthesizer"],
		["fan-in", "package:synthesizer"],
	]);
	for (const [query, ref] of expectations) {
		const refs = catalogAgents(discovery, query).map((agent) => agent.ref);
		assert.equal(refs.includes(ref), true, `${query} should include ${ref}; got ${refs.join(", ")}`);
	}
});

test("catalogAgents filters by query and exposes stable refs", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-multiagent-catalog-"));
	const packageDir = join(root, "package-agents");
	await makeAgent(packageDir, "planner.md", "---\nname: planner\ndescription: creates implementation plans\n---\nPrompt");
	await makeAgent(packageDir, "reviewer.md", "---\nname: reviewer\ndescription: reviews tests\n---\nPrompt");
	const discovery = discoverAgents({ cwd: root, packageAgentsDir: packageDir, library: normalizeLibraryOptions({ sources: ["package"], query: "test" }) });
	const catalog = catalogAgents(discovery, discovery.sources.length > 0 ? "test" : undefined);
	assert.deepEqual(catalog.map((agent) => agent.ref), ["package:reviewer"]);
	assert.equal(catalog[0].sha256.length, 64);
	await rm(root, { recursive: true, force: true });
});
