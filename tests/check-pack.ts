import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_SURFACE_BUDGET } from "./package-policy.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: packageRoot, encoding: "utf8" });
if (result.stderr.length > 0) process.stderr.write(result.stderr);
assert.equal(result.status, 0, result.error?.message ?? result.stderr);

const parsed: unknown = JSON.parse(result.stdout.trim());
assert.equal(typeof parsed === "object" && parsed !== null, true, "npm pack did not emit JSON");
const manifest = Array.isArray(parsed) ? parsed[0] : Object.values(parsed as Record<string, unknown>)[0];
assert.equal(typeof manifest === "object" && manifest !== null && "files" in manifest, true, "npm pack JSON should include files");
const rawFiles = manifest.files;
assert.equal(Array.isArray(rawFiles), true, "npm pack files should be an array");
const rawUnpackedSize = "unpackedSize" in manifest ? manifest.unpackedSize : undefined;
assert.equal(typeof rawUnpackedSize === "number" && rawUnpackedSize <= PACKAGE_SURFACE_BUDGET.maxUnpackedSizeBytes, true, `packed artifact should stay at or below the ${PACKAGE_SURFACE_BUDGET.maxUnpackedSizeBytes}-byte package surface budget`);

const paths = new Set<string>();
for (const rawFile of rawFiles) {
	assert.equal(typeof rawFile === "object" && rawFile !== null && "path" in rawFile, true, "npm pack file entries should include path");
	assert.equal(typeof rawFile.path, "string", "npm pack file path should be a string");
	paths.add(rawFile.path);
}

for (const required of requiredPackedFiles()) {
	assert.equal(paths.has(required), true, `packed artifact is missing ${required}`);
}
assert.equal(paths.has("agents/web-researcher.md"), true, "packed artifact is missing the bundled web researcher agent");
for (const forbidden of [
	".gitignore",
	".npmignore",
	".npmrc",
	"CONTINUE.md",
	"PLAN.md",
	"HANDOFF.md",
	"meta_study.md",
	"package-lock.json",
	"pnpm-lock.yaml",
	"tests/smoke-fake-pi.ts",
	"tests/check-pack.ts",
	"VISION.md",
	"ARCH.md",
	"AGENTS.md",
]) {
	assert.equal(paths.has(forbidden), false, `packed artifact should not include ${forbidden}`);
}
assert.equal(paths.size <= PACKAGE_SURFACE_BUDGET.maxPackedFiles, true, `packed artifact should stay within the ${PACKAGE_SURFACE_BUDGET.maxPackedFiles}-file package surface budget`);
for (const path of paths) {
	assert.equal(isAllowedPackedPath(path), true, `packed artifact includes an unexpected package surface: ${path}`);
	assert.equal(path.startsWith("tests/"), false, `packed artifact should not include tests: ${path}`);
	assert.equal(path.startsWith(".pi/"), false, `packed artifact should not include runtime state: ${path}`);
}

function isAllowedPackedPath(path: string): boolean {
	return path === "package.json" || path === "README.md" || path === "CHANGELOG.md" || path === "LICENSE" || path.startsWith("agents/") || path.startsWith("assets/") || path.startsWith("examples/") || path.startsWith("skills/") || path.startsWith("extensions/");
}

function requiredPackedFiles(): string[] {
	return [
		"package.json",
		"README.md",
		"CHANGELOG.md",
		"LICENSE",
		...collectFiles("agents", ".md"),
		...collectFiles("assets", ".webp"),
		...collectFiles("examples", ".json"),
		...collectFiles("skills", ".md"),
		...collectFiles("extensions", ".ts"),
	];
}

function collectFiles(directory: string, extension: string): string[] {
	const root = join(packageRoot, directory);
	const results: string[] = [];
	collectFilesInto(root, extension, results);
	return results.sort();
}

function collectFilesInto(directory: string, extension: string, results: string[]): void {
	for (const entry of readdirSync(directory)) {
		const fullPath = join(directory, entry);
		const stats = statSync(fullPath);
		if (stats.isDirectory()) {
			collectFilesInto(fullPath, extension, results);
			continue;
		}
		if (!stats.isFile() || !fullPath.endsWith(extension)) continue;
		results.push(relative(packageRoot, fullPath).split(sep).join("/"));
	}
}
