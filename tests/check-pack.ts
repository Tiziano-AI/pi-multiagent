import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: packageRoot, encoding: "utf8" });
if (result.stderr.length > 0) process.stderr.write(result.stderr);
assert.equal(result.status, 0, result.error?.message ?? result.stderr);

const firstJson = result.stdout.indexOf("[");
const lastJson = result.stdout.lastIndexOf("]");
assert.equal(firstJson >= 0 && lastJson >= firstJson, true, "npm pack did not emit JSON");
const parsed: unknown = JSON.parse(result.stdout.slice(firstJson, lastJson + 1));
assert.equal(Array.isArray(parsed), true, "npm pack JSON should be an array");
const manifest = parsed[0];
assert.equal(typeof manifest === "object" && manifest !== null && "files" in manifest, true, "npm pack JSON should include files");
const rawFiles = manifest.files;
assert.equal(Array.isArray(rawFiles), true, "npm pack files should be an array");

const paths = new Set<string>();
for (const rawFile of rawFiles) {
	assert.equal(typeof rawFile === "object" && rawFile !== null && "path" in rawFile, true, "npm pack file entries should include path");
	assert.equal(typeof rawFile.path, "string", "npm pack file path should be a string");
	paths.add(rawFile.path);
}

for (const required of requiredPackedFiles()) {
	assert.equal(paths.has(required), true, `packed artifact is missing ${required}`);
}
for (const forbidden of ["PLAN.md", "tests/smoke-pi.ts", "tests/check-pack.ts"]) {
	assert.equal(paths.has(forbidden), false, `packed artifact should not include ${forbidden}`);
}
for (const path of paths) {
	assert.equal(path.startsWith("tests/"), false, `packed artifact should not include tests: ${path}`);
	assert.equal(path.startsWith(".pi/"), false, `packed artifact should not include runtime state: ${path}`);
}

function requiredPackedFiles(): string[] {
	return [
		"package.json",
		"README.md",
		"AGENTS.md",
		"VISION.md",
		"ARCH.md",
		"LICENSE",
		...collectFiles("agents", ".md"),
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
