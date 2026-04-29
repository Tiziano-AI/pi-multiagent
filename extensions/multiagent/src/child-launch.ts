/** Child Pi launch argument construction for delegated subagents. */

import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { AgentInvocationDefaults, ResolvedAgent } from "./types.ts";

export interface SpawnOptions {
	cwd: string;
	shell: false;
	stdio: ["pipe", "pipe", "pipe"];
}

export type SpawnProcess = (command: string, args: string[], options: SpawnOptions) => ChildProcessWithoutNullStreams;

export function buildPiArgs(agent: ResolvedAgent, defaults: AgentInvocationDefaults, promptPath: string): string[] {
	const args = [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--no-extensions",
		"--no-context-files",
		"--no-skills",
		"--no-prompt-templates",
		"--no-themes",
		"--system-prompt",
		"",
		"--append-system-prompt",
		promptPath,
	];
	const model = agent.model ?? defaults.model;
	const thinking = agent.thinking === "inherit" || agent.thinking === undefined ? defaults.thinking : agent.thinking;
	if (model) args.push("--model", model);
	if (thinking) args.push("--thinking", thinking);
	if (agent.tools.length === 0) args.push("--no-tools");
	else args.push("--tools", agent.tools.join(","));
	return args;
}

export function getPiInvocation(args: string[], cwd: string): { command: string; args: string[] } {
	const deniedRoots = findDeniedRoots(cwd);
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/") ?? false;
	const currentScriptPath = currentScript && !isBunVirtualScript ? resolve(currentScript) : undefined;
	if (currentScriptPath && existsSync(currentScriptPath) && isTrustedLaunchPath(deniedRoots, process.execPath) && isTrustedLaunchPath(deniedRoots, currentScriptPath)) return { command: process.execPath, args: [currentScriptPath, ...args] };
	const execName = basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(execName) && isTrustedLaunchPath(deniedRoots, process.execPath)) return { command: process.execPath, args };
	const command = resolvePiCommandFromPath(process.env.PATH ?? "", cwd);
	if (!command) throw new Error("Unable to resolve a trusted absolute pi launcher from PATH; refusing to spawn bare pi.");
	return { command, args };
}

export function resolvePiCommandFromPath(pathEnv: string, cwd: string): string | undefined {
	const deniedRoots = findDeniedRoots(cwd);
	for (const entry of pathEnv.split(delimiter)) {
		if (!entry || !isAbsolute(entry)) continue;
		const candidate = resolve(entry, process.platform === "win32" ? "pi.cmd" : "pi");
		if (isExecutableFile(candidate) && !isContainedInAnyRoot(deniedRoots, candidate)) return candidate;
		if (process.platform === "win32") {
			const psCandidate = resolve(entry, "pi.ps1");
			if (isExecutableFile(psCandidate) && !isContainedInAnyRoot(deniedRoots, psCandidate)) return psCandidate;
		}
	}
	return undefined;
}

function findDeniedRoots(cwd: string): string[] {
	const roots = new Set<string>();
	addProjectRoot(roots, resolve(cwd));
	const realCwd = safeRealpath(resolve(cwd));
	if (realCwd) addProjectRoot(roots, realCwd);
	return [...roots];
}

function addProjectRoot(roots: Set<string>, cwd: string): void {
	roots.add(findProjectRoot(cwd));
}

function findProjectRoot(cwd: string): string {
	let current = resolve(cwd);
	while (true) {
		if (hasProjectMarker(current)) return current;
		const parent = dirname(current);
		if (parent === current) return resolve(cwd);
		current = parent;
	}
}

function hasProjectMarker(path: string): boolean {
	return pathExists(join(path, ".git")) || pathExists(join(path, ".pi"));
}

function pathExists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

function isTrustedLaunchPath(deniedRoots: string[], path: string): boolean {
	return !isContainedInAnyRoot(deniedRoots, path);
}

function isContainedInAnyRoot(roots: string[], child: string): boolean {
	const lexicalChild = resolve(child);
	if (roots.some((root) => isContainedPath(root, lexicalChild))) return true;
	const realChild = safeRealpath(lexicalChild);
	return realChild ? roots.some((root) => isContainedPath(root, realChild)) : false;
}

function isContainedPath(parent: string, child: string): boolean {
	const normalizedParent = resolve(parent);
	const normalizedChild = resolve(child);
	const parentPrefix = normalizedParent.endsWith(sep) ? normalizedParent : `${normalizedParent}${sep}`;
	return normalizedChild === normalizedParent || normalizedChild.startsWith(parentPrefix);
}

function safeRealpath(path: string): string | undefined {
	try {
		return resolve(realpathSync(path));
	} catch {
		return undefined;
	}
}

function isExecutableFile(path: string): boolean {
	try {
		const stats = statSync(path);
		return stats.isFile() && (process.platform === "win32" || (stats.mode & 0o111) !== 0);
	} catch {
		return false;
	}
}
