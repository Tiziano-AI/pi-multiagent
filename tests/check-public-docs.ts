import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const version = readPackageVersion();
const publicFiles = [
	"package.json",
	"README.md",
	"ARCH.md",
	"VISION.md",
	"AGENTS.md",
	...collectFiles("agents", ".md"),
	...collectFiles("skills", ".md"),
	...collectFiles("extensions", ".ts"),
];

const failures: string[] = [];

for (const file of publicFiles) {
	const text = readFileSync(join(packageRoot, file), "utf8");
	checkPortableText(file, text);
	if (file.endsWith(".md")) checkMarkdownLinks(file, text);
}

checkPinnedGithubTags();
checkRuntimeCatalogIsAuthoritative();
checkSkillReferenceShape();

assert.equal(failures.length, 0, `Public package portability checks failed:\n${failures.join("\n")}`);

function readPackageVersion(): string {
	const parsed: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	if (!isObject(parsed) || typeof parsed.version !== "string") throw new Error("package.json must contain a string version");
	return parsed.version;
}

function isObject(value: unknown): value is { version?: unknown } {
	return typeof value === "object" && value !== null;
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

function checkPortableText(file: string, text: string): void {
	const deniedFragments = [
		"/" + "Users/",
		"Code/" + "pi-multiagent",
		packageRoot,
		"is" + "Latest",
	];
	for (const fragment of deniedFragments) {
		if (fragment.length > 0 && text.includes(fragment)) failures.push(`${file}: public package copy must not include machine-local or unsupported fragment ${JSON.stringify(fragment)}`);
	}
}

function checkMarkdownLinks(file: string, text: string): void {
	const linkPattern = /\[[^\]\n]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	for (const match of text.matchAll(linkPattern)) {
		const rawTarget = match[1];
		if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://") || rawTarget.startsWith("mailto:") || rawTarget.startsWith("#")) continue;
		const withoutAnchor = rawTarget.split("#", 1)[0];
		if (withoutAnchor.length === 0) continue;
		const targetPath = resolve(packageRoot, dirname(file), withoutAnchor);
		if (!existsSync(targetPath)) failures.push(`${file}: Markdown link target does not exist: ${rawTarget}`);
	}
}

function checkPinnedGithubTags(): void {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const tagPattern = /github\.com\/Tiziano-AI\/pi-multiagent@v([0-9]+\.[0-9]+\.[0-9]+)/g;
	for (const match of readme.matchAll(tagPattern)) {
		if (match[1] !== version) failures.push(`README.md: pinned GitHub install tag v${match[1]} does not match package version v${version}`);
	}
}

function checkRuntimeCatalogIsAuthoritative(): void {
	const checkedFiles = ["README.md", "skills/pi-multiagent/SKILL.md"];
	for (const file of checkedFiles) {
		const text = readFileSync(join(packageRoot, file), "utf8");
		const staticReadmeTable = "| Ref | Best use | " + "Default tools | Thinking |";
		const staticSkillTable = "| Ref | Use for | " + "Default tools | Caution |";
		if (text.includes(staticReadmeTable) || text.includes(staticSkillTable)) {
			failures.push(`${file}: package-agent tools/thinking tables must not duplicate runtime catalog output`);
		}
		if (!text.includes("authoritative") || !text.includes("catalog")) failures.push(`${file}: must state that runtime catalog output is authoritative for package-agent metadata`);
	}
}

function checkSkillReferenceShape(): void {
	const skill = readFileSync(join(packageRoot, "skills/pi-multiagent/SKILL.md"), "utf8");
	for (const target of ["[README](../../README.md)", "[ARCH](../../ARCH.md)", "[VISION](../../VISION.md)", "[AGENTS](../../AGENTS.md)"]) {
		if (!skill.includes(target)) failures.push(`skills/pi-multiagent/SKILL.md: missing linked reference ${target}`);
	}
}
