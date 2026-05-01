/** Extension source identity and fingerprint checks for delegated child grants. */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { ResolvedExtensionSource } from "./types.ts";

const MAX_EXTENSION_HASH_BYTES = 4 * 1024 * 1024;
const MAX_EXTENSION_FINGERPRINT_ENTRIES = 2048;

export function readExtensionSource(path: string): { source: ResolvedExtensionSource; error?: never } | { source?: never; error: string } {
	if (!isAbsolute(path)) return { error: "sourceInfo.path is not an absolute path" };
	let lexicalStats: ReturnType<typeof lstatSync>;
	try {
		lexicalStats = lstatSync(path);
	} catch (error) {
		return { error: `sourceInfo.path is not accessible: ${errorMessage(error)}` };
	}
	if (lexicalStats.isSymbolicLink()) return { error: "sourceInfo.path is a symlink; symlinked extension sources are denied" };
	if (!lexicalStats.isFile() && !lexicalStats.isDirectory()) return { error: "sourceInfo.path is not a regular file or directory" };
	let realpath: string;
	try {
		realpath = realpathSync(path);
	} catch (error) {
		return { error: `sourceInfo.path realpath failed: ${errorMessage(error)}` };
	}
	const lexicalAfter = readLexicalStats(path);
	if (lexicalAfter.error) return { error: lexicalAfter.error };
	if (!sameNode(lexicalStats, lexicalAfter.stats)) return { error: "sourceInfo.path changed during inspection" };
	let stats: ReturnType<typeof statSync>;
	try {
		stats = statSync(realpath);
	} catch (error) {
		return { error: `sourceInfo.path stat failed: ${errorMessage(error)}` };
	}
	const fingerprint = fingerprintExtensionSource(realpath, stats);
	if (fingerprint.error) return { error: fingerprint.error };
	return {
		source: {
			path,
			realpath,
			source: "",
			scope: "temporary",
			origin: "top-level",
			baseDir: undefined,
			dev: stats.dev,
			ino: stats.ino,
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			sha256: fingerprint.sha256,
		},
	};
}

export function sameSourceState(left: ResolvedExtensionSource, right: ResolvedExtensionSource): boolean {
	return sameResolvedExtensionSource(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.sha256 === right.sha256;
}

export function sameResolvedExtensionSource(left: ResolvedExtensionSource, right: ResolvedExtensionSource): boolean {
	return left.realpath === right.realpath || (left.dev === right.dev && left.ino === right.ino);
}

function readLexicalStats(path: string): { stats: ReturnType<typeof lstatSync>; error?: never } | { stats?: never; error: string } {
	try {
		return { stats: lstatSync(path) };
	} catch (error) {
		return { error: `sourceInfo.path changed during inspection: ${errorMessage(error)}` };
	}
}

function fingerprintExtensionSource(path: string, stats: ReturnType<typeof statSync>): { sha256: string; error?: never } | { sha256?: never; error: string } {
	if (stats.isFile()) {
		if (stats.size > MAX_EXTENSION_HASH_BYTES) return { error: `sourceInfo.path exceeds ${MAX_EXTENSION_HASH_BYTES} byte fingerprint limit` };
		return { sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
	}
	const hash = createHash("sha256");
	const stack: { dir: string; relative: string }[] = [{ dir: path, relative: "" }];
	let entries = 0;
	let hashedBytes = 0;
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;
		let children: ReturnType<typeof readdirSync>;
		try {
			children = readdirSync(current.dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
		} catch (error) {
			return { error: `sourceInfo.path directory read failed: ${errorMessage(error)}` };
		}
		for (const child of children) {
			entries += 1;
			if (entries > MAX_EXTENSION_FINGERPRINT_ENTRIES) return { error: `sourceInfo.path directory has more than ${MAX_EXTENSION_FINGERPRINT_ENTRIES} entries; use a single-file extension source for delegation` };
			const fullPath = join(current.dir, child.name);
			const relative = current.relative ? `${current.relative}/${child.name}` : child.name;
			let childStats: ReturnType<typeof lstatSync>;
			try {
				childStats = lstatSync(fullPath);
			} catch (error) {
				return { error: `sourceInfo.path directory stat failed: ${errorMessage(error)}` };
			}
			if (childStats.isSymbolicLink()) return { error: `sourceInfo.path directory contains symlink ${relative}; symlinked extension sources are denied` };
			hash.update(`${relative}\0${childStats.dev}:${childStats.ino}:${childStats.mode}:${childStats.size}:${childStats.mtimeMs}\0`);
			if (childStats.isDirectory()) stack.push({ dir: fullPath, relative });
			else if (childStats.isFile()) {
				if (hashedBytes + childStats.size > MAX_EXTENSION_HASH_BYTES) return { error: `sourceInfo.path directory exceeds ${MAX_EXTENSION_HASH_BYTES} byte fingerprint limit` };
				hash.update(readFileSync(fullPath));
				hashedBytes += childStats.size;
			}
		}
	}
	return { sha256: hash.digest("hex") };
}

function sameNode(left: ReturnType<typeof lstatSync>, right: ReturnType<typeof lstatSync>): boolean {
	return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.size === right.size && left.mtimeMs === right.mtimeMs;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
