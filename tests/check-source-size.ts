import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_LINES = 500;
const MAX_BYTES = 18 * 1024;
const roots = [join(process.cwd(), "extensions")];

async function collectTypeScriptFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...await collectTypeScriptFiles(path));
		else if (entry.isFile() && path.endsWith(".ts")) files.push(path);
	}
	return files;
}

const files = (await Promise.all(roots.map(collectTypeScriptFiles))).flat();
const failures: string[] = [];
for (const file of files) {
	const content = await readFile(file);
	const lines = content.toString("utf8").split("\n").length;
	if (lines > MAX_LINES || content.length > MAX_BYTES) failures.push(`${file}: ${lines} lines, ${content.length} bytes`);
}
assert.equal(failures.length, 0, `Source files exceed ${MAX_LINES} lines or ${MAX_BYTES} bytes:\n${failures.join("\n")}`);
