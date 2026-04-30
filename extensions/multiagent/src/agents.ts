/** Agent library discovery for pi-multiagent. */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type {
	AgentConfig,
	AgentDiagnostic,
	AgentDiscoveryResult,
	CatalogAgentSummary,
	LibraryOptions,
	LibrarySource,
	ProjectAgentsPolicy,
} from "./types.ts";
import { DEFAULT_LIBRARY_SOURCES, DEFAULT_PROJECT_AGENTS_POLICY, LIBRARY_SOURCE_VALUES, TOOL_NAME_PATTERN } from "./types.ts";
import { validateToolNames } from "./tool-policy.ts";

const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const TOOL_NAME_REGEX = new RegExp(TOOL_NAME_PATTERN);
const VALID_THINKING = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
const SOURCE_PRECEDENCE: LibrarySource[] = ["package", "user", "project"];

interface ParsedMarkdown {
	frontmatter: Record<string, string>;
	body: string;
}

function parseMarkdownFrontmatter(content: string): ParsedMarkdown {
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) return { frontmatter: {}, body: normalized };
	const end = normalized.indexOf("\n---", 4);
	if (end === -1) return { frontmatter: {}, body: normalized };
	const raw = normalized.slice(4, end);
	const body = normalized.slice(end + 5).replace(/^\n/, "");
	const frontmatter: Record<string, string> = {};
	for (const line of raw.split("\n")) {
		const index = line.indexOf(":");
		if (index <= 0) continue;
		const key = line.slice(0, index).trim();
		const value = line.slice(index + 1).trim().replace(/^[\'"]|[\'"]$/g, "");
		if (key.length > 0) frontmatter[key] = value;
	}
	return { frontmatter, body };
}

function splitTools(value: string | undefined): string[] | undefined {
	if (!value) return undefined;
	const tools = value
		.split(/[\s,]+/)
		.map((tool) => tool.trim())
		.filter((tool) => tool.length > 0);
	return tools.length > 0 ? tools : undefined;
}

function readAgentFile(filePath: string, source: Exclude<LibrarySource, never>, diagnostics: AgentDiagnostic[]): AgentConfig | undefined {
	let content: string;
	try {
		content = readFileSync(filePath, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		diagnostics.push({ code: "agent-read-failed", path: filePath, message, severity: "warning" });
		return undefined;
	}
	const parsed = parseMarkdownFrontmatter(content);
	const name = parsed.frontmatter.name;
	const description = parsed.frontmatter.description;
	if (!name || !description) {
		diagnostics.push({
			code: "agent-frontmatter-invalid",
			path: filePath,
			message: "Agent files require name and description frontmatter.",
			severity: "warning",
		});
		return undefined;
	}
	if (!AGENT_NAME_PATTERN.test(name)) {
		diagnostics.push({ code: "agent-name-invalid", path: filePath, message: `Invalid agent name: ${name}`, severity: "warning" });
		return undefined;
	}
	const thinking = parsed.frontmatter.thinking;
	if (thinking && !VALID_THINKING.has(thinking)) {
		diagnostics.push({
			code: "agent-thinking-invalid",
			path: filePath,
			message: `Invalid thinking level for ${name}: ${thinking}`,
			severity: "warning",
		});
		return undefined;
	}
	const tools = splitTools(parsed.frontmatter.tools);
	const invalidTools = tools?.filter((tool) => !TOOL_NAME_REGEX.test(tool)) ?? [];
	if (invalidTools.length > 0) {
		diagnostics.push({
			code: "agent-tools-invalid",
			path: filePath,
			message: `Invalid tool names for ${name}: ${invalidTools.join(", ")}`,
			severity: "warning",
		});
		return undefined;
	}
	if (!validateToolNames(tools, `library agent ${source}:${name}`, diagnostics, filePath, "warning")) return undefined;
	return {
		name,
		ref: `${source}:${name}`,
		description,
		tools,
		model: parsed.frontmatter.model || undefined,
		thinking: thinking as AgentConfig["thinking"],
		systemPrompt: parsed.body.trim(),
		source,
		filePath,
		sha256: createHash("sha256").update(content).digest("hex"),
	};
}

function loadAgentsFromDir(dir: string, source: LibrarySource, diagnostics: AgentDiagnostic[]): AgentConfig[] {
	if (!existsSync(dir)) return [];
	const realProjectDir = source === "project" ? validateProjectAgentsDir(dir, diagnostics) : undefined;
	if (source === "project" && !realProjectDir) return [];
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		diagnostics.push({ code: "agent-dir-list-failed", path: dir, message, severity: "warning" });
		return [];
	}
	const agents: AgentConfig[] = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		const filePath = join(dir, entry.name);
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;
		if (source === "user" && entry.isSymbolicLink()) {
			diagnostics.push({
				code: "user-agent-symlink-denied",
				path: filePath,
				message: "User agent symlinks are denied; use regular files in the configured user agent directory.",
				severity: "warning",
			});
			continue;
		}
		if (source === "project" && entry.isSymbolicLink()) {
			diagnostics.push({
				code: "project-agent-symlink-denied",
				path: filePath,
				message: "Project agent symlinks are denied; prompts must be regular files inside .pi/agents.",
				severity: "warning",
			});
			continue;
		}
		if (source === "project" && realProjectDir) {
			const realFile = safeRealpath(filePath);
			if (!realFile || !isContainedPath(realProjectDir, realFile)) {
				diagnostics.push({
					code: "project-agent-path-escape-denied",
					path: filePath,
					message: "Project agent path resolves outside the trusted .pi/agents directory.",
					severity: "warning",
				});
				continue;
			}
		}
		const agent = readAgentFile(filePath, source, diagnostics);
		if (agent) agents.push(agent);
	}
	return agents.sort((left, right) => left.name.localeCompare(right.name));
}

function safeRealpath(path: string): string | undefined {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

function safeLstat(path: string): ReturnType<typeof lstatSync> | undefined {
	try {
		return lstatSync(path);
	} catch {
		return undefined;
	}
}

function validateProjectAgentsDir(dir: string, diagnostics: AgentDiagnostic[]): string | undefined {
	const dirStats = safeLstat(dir);
	if (!dirStats) return undefined;
	if (dirStats.isSymbolicLink()) {
		diagnostics.push({
			code: "project-agent-dir-symlink-denied",
			path: dir,
			message: "Project .pi/agents directory symlinks are denied; prompts must live inside the repository.",
			severity: "warning",
		});
		return undefined;
	}
	const realProjectDir = safeRealpath(dir);
	const realProjectRoot = safeRealpath(dirname(dirname(dir)));
	if (!realProjectDir || !realProjectRoot || !isContainedPath(realProjectRoot, realProjectDir)) {
		diagnostics.push({
			code: "project-agent-dir-path-escape-denied",
			path: dir,
			message: "Project .pi/agents directory resolves outside the trusted project root.",
			severity: "warning",
		});
		return undefined;
	}
	return realProjectDir;
}

function isContainedPath(parent: string, child: string): boolean {
	const normalizedParent = resolve(parent);
	const normalizedChild = resolve(child);
	return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`);
}

function isProjectScopedUserAgentsDir(userAgentsDir: string, projectAgentsDir: string | undefined, cwd: string, globalPiDir: string): boolean {
	const userDir = resolve(userAgentsDir);
	const userRealDir = safeRealpath(userDir);
	const projectRoots = projectRootCandidates(cwd, projectAgentsDir, globalPiDir);
	return projectRoots.some((root) => isContainedPath(root, userDir) || (userRealDir !== undefined && isContainedPath(root, userRealDir)));
}

function projectRootCandidates(cwd: string, projectAgentsDir: string | undefined, globalPiDir: string): string[] {
	const candidates = new Set<string>();
	if (projectAgentsDir) addPathAndRealpath(candidates, dirname(dirname(resolve(projectAgentsDir))));
	addNearestProjectRoots(candidates, resolve(cwd), globalPiDir);
	const realCwd = safeRealpath(resolve(cwd));
	const realGlobalPiDir = safeRealpath(globalPiDir);
	if (realCwd) addNearestProjectRoots(candidates, realCwd, realGlobalPiDir ?? globalPiDir);
	return [...candidates];
}

function addNearestProjectRoots(candidates: Set<string>, cwd: string, globalPiDir: string): void {
	const nearestPi = findNearestProjectPiMarker(cwd, globalPiDir);
	if (nearestPi) addPathAndRealpath(candidates, dirname(nearestPi));
	const nearestGit = findNearestProjectGitDir(cwd);
	if (nearestGit) addPathAndRealpath(candidates, dirname(nearestGit));
}

function addPathAndRealpath(paths: Set<string>, path: string): void {
	paths.add(resolve(path));
	const real = safeRealpath(path);
	if (real) paths.add(resolve(real));
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

export function findNearestProjectAgentsDir(cwd: string, globalPiDir = getGlobalPiDir()): string | undefined {
	const projectPiDir = findNearestProjectPiDir(cwd, globalPiDir);
	if (!projectPiDir) return undefined;
	const candidate = join(projectPiDir, "agents");
	return isDirectory(candidate) ? candidate : undefined;
}

function findNearestProjectPiDir(cwd: string, globalPiDir: string): string | undefined {
	return findNearestProjectDir(cwd, ".pi", globalPiDir);
}

function findNearestProjectPiMarker(cwd: string, globalPiDir: string): string | undefined {
	return findNearestProjectMarker(cwd, ".pi", globalPiDir);
}

function findNearestProjectGitDir(cwd: string): string | undefined {
	return findNearestProjectMarker(cwd, ".git");
}

function findNearestProjectMarker(cwd: string, name: string, ignoredPath?: string): string | undefined {
	let current = resolve(cwd);
	while (true) {
		const candidate = join(current, name);
		const stats = safeLstat(candidate);
		if ((stats?.isDirectory() || stats?.isFile() || stats?.isSymbolicLink()) && !isIgnoredProjectMarker(candidate, ignoredPath)) return candidate;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function findNearestProjectDir(cwd: string, name: string, ignoredPath?: string): string | undefined {
	let current = resolve(cwd);
	while (true) {
		const candidate = join(current, name);
		if (safeLstat(candidate)?.isDirectory() && !isIgnoredProjectMarker(candidate, ignoredPath)) return candidate;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function isIgnoredProjectMarker(candidate: string, ignoredPath: string | undefined): boolean {
	return ignoredPath !== undefined && resolve(candidate) === resolve(ignoredPath);
}

function getGlobalPiDir(): string {
	return join(homedir(), ".pi");
}

export function getDefaultUserAgentsDir(env: NodeJS.ProcessEnv = process.env): string {
	return join(env.PI_CODING_AGENT_DIR ?? join(getGlobalPiDir(), "agent"), "agents");
}

export function normalizeLibraryOptions(input: {
	sources?: LibrarySource[];
	query?: string;
	projectAgents?: ProjectAgentsPolicy;
} | undefined): LibraryOptions {
	const sources = input?.sources && input.sources.length > 0 ? dedupeSources(input.sources) : DEFAULT_LIBRARY_SOURCES;
	return {
		sources,
		query: normalizeQuery(input?.query),
		projectAgents: input?.projectAgents ?? DEFAULT_PROJECT_AGENTS_POLICY,
	};
}

export function discoverAgents(options: {
	cwd: string;
	packageAgentsDir: string;
	library: LibraryOptions;
	userAgentsDir?: string;
	projectAgentsDir?: string;
	globalPiDir?: string;
}): AgentDiscoveryResult {
	const diagnostics: AgentDiagnostic[] = [];
	const globalPiDir = options.globalPiDir ?? getGlobalPiDir();
	const userAgentsDir = options.userAgentsDir ?? getDefaultUserAgentsDir();
	const projectAgentsDir = options.projectAgentsDir ?? findNearestProjectAgentsDir(options.cwd, globalPiDir);
	const requestedSources = new Set(options.library.sources);
	const unsafeUserAgentsDir = isProjectScopedUserAgentsDir(userAgentsDir, projectAgentsDir, options.cwd, globalPiDir);
	const activeSources = SOURCE_PRECEDENCE.filter(
		(source) => requestedSources.has(source) && (source !== "user" || !unsafeUserAgentsDir) && (source !== "project" || options.library.projectAgents === "allow"),
	);
	if (options.library.sources.includes("project") && options.library.projectAgents !== "allow") {
		diagnostics.push({
			code: options.library.projectAgents === "confirm" ? "project-agents-confirm-unprepared" : "project-agents-denied",
			path: projectAgentsDir,
			message: options.library.projectAgents === "confirm" ? 'Project library source requires prepareLibraryOptions approval before discovery.' : 'Project library source requested but library.projectAgents is "deny".',
			severity: options.library.projectAgents === "confirm" ? "error" : "info",
		});
	}
	if (unsafeUserAgentsDir && options.library.sources.includes("user")) {
		diagnostics.push({
			code: "user-agents-dir-project-scoped",
			path: userAgentsDir,
			message: "User agent directory resolves inside the current project; denied as untrusted project-controlled prompts.",
			severity: "error",
		});
	}
	const byRef = new Map<string, AgentConfig>();
	for (const source of activeSources) {
		const dir = source === "package" ? options.packageAgentsDir : source === "user" ? userAgentsDir : projectAgentsDir;
		if (!dir) continue;
		for (const agent of loadAgentsFromDir(dir, source, diagnostics)) {
			if (byRef.has(agent.ref)) {
				diagnostics.push({
					code: "agent-ref-duplicate",
					path: agent.filePath,
					message: `Agent ref ${agent.ref} is already loaded; duplicate source ref denied.`,
					severity: "warning",
				});
				continue;
			}
			byRef.set(agent.ref, agent);
		}
	}
	return {
		agents: Array.from(byRef.values()).sort(compareAgents),
		diagnostics,
		packageAgentsDir: options.packageAgentsDir,
		userAgentsDir,
		projectAgentsDir,
		sources: activeSources,
		projectAgents: options.library.projectAgents,
	};
}

export function catalogAgents(discovery: AgentDiscoveryResult, query: string | undefined): CatalogAgentSummary[] {
	const normalizedQuery = query?.toLowerCase();
	return discovery.agents
		.filter((agent) => {
			if (!normalizedQuery) return true;
			return [agent.name, agent.ref, agent.description, agent.source, agent.tools?.join(" ") ?? "", agent.model ?? "", agent.filePath]
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery);
		})
		.map((agent) => ({
			name: agent.name,
			ref: agent.ref,
			source: agent.source,
			description: agent.description,
			tools: agent.tools,
			model: agent.model,
			thinking: agent.thinking,
			filePath: agent.filePath,
			sha256: agent.sha256,
		}));
}

function dedupeSources(sources: LibrarySource[]): LibrarySource[] {
	const allowed = new Set<LibrarySource>(LIBRARY_SOURCE_VALUES);
	const seen = new Set<LibrarySource>();
	const result: LibrarySource[] = [];
	for (const source of sources) {
		if (!allowed.has(source) || seen.has(source)) continue;
		seen.add(source);
		result.push(source);
	}
	return result;
}

function compareAgents(left: AgentConfig, right: AgentConfig): number {
	const name = left.name.localeCompare(right.name);
	if (name !== 0) return name;
	return SOURCE_PRECEDENCE.indexOf(left.source) - SOURCE_PRECEDENCE.indexOf(right.source);
}

function normalizeQuery(query: string | undefined): string | undefined {
	const trimmed = query?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
