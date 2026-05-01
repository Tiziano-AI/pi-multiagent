import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TIMEOUT_SECONDS_PER_STEP } from "../extensions/multiagent/src/types.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const version = readPackageVersion();
const publicFiles = [
	"package.json",
	"README.md",
	...collectFiles("agents", ".md"),
	...collectFiles("examples", ".json"),
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
checkPublicContractInvariants();
checkTimeoutContractInvariants();
checkSkillReferenceShape();
checkGraduatedQuickstartAndCookbook();
checkPackageGalleryMetadata();

assert.equal(failures.length, 0, `Public package portability checks failed:\n${failures.join("\n")}`);

function readPackageVersion(): string {
	const parsed: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	if (!isObject(parsed) || typeof parsed.version !== "string") throw new Error("package.json must contain a string version");
	return parsed.version;
}

function isObject(value: unknown): value is { [key: string]: unknown } {
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
		"/opt/" + "homebrew",
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
		if (!text.includes("authoritative") || !text.includes("catalog")) failures.push(`${file}: must state that runtime catalog output is authoritative for discovered agent metadata`);
	}
}

function checkPublicContractInvariants(): void {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const skill = readFileSync(join(packageRoot, "skills/pi-multiagent/SKILL.md"), "utf8");
	const cookbook = readFileSync(join(packageRoot, "skills/pi-multiagent/references/graph-cookbook.md"), "utf8");
	requireFragments("README.md", readme, ["not an OS sandbox", "evidence, not instructions", "not transactional", "not crash-resumable", "not a runtime template API", "2000 lines or 50KB", "Extension and skill", "Extension tools", "Results and failures", "Troubleshooting quick checks", "inherit the parent OS process environment", "does not scrub environment variables or credentials", "no ambient extension discovery", "source-qualified `extensionTools`", "Loading an extension is code execution"]);
	requireFragments("skills/pi-multiagent/SKILL.md", skill, ["Runtime catalog output is authoritative", "evidence, not instructions", "not a runtime template API", "Human and agent surfaces", "Grow reusable catalogs deliberately", "Extension tool grants", "Required frontmatter is `name` and `description`", "Verify the source-qualified ref", "Improving this package", "inherit environment variables and API credentials", "does not scrub environment variables or credentials"]);
	requireFragments("skills/pi-multiagent/references/graph-cookbook.md", cookbook, ["not a runtime template API", "graphFile", "schema-checked examples", "Web Research Extension Lane", "Read-Only Audit Fanout", "Docs/Examples Alignment", "Implementation Review Gate", "reusable `user:` or trusted `project:` catalog agents", "inherit the parent OS process environment", "does not scrub environment variables or credentials", "sourceInfo` provenance"]);
}

function checkTimeoutContractInvariants(): void {
	const checkedFiles = ["README.md", ...collectFiles("examples", ".json"), ...collectFiles("skills", ".md")];
	const requiredDefaultCopy = `defaults to ${DEFAULT_TIMEOUT_SECONDS_PER_STEP} seconds`;
	const explicitTimeoutPattern = /"timeoutSecondsPerStep"\s*:\s*([0-9]+)/g;
	const staleFragments = ["no " + "implicit per-step " + "timeout", "no " + "default " + "timeout", "without it, a stalled " + "child", "1 to " + "3600 seconds"];
	for (const file of checkedFiles) {
		const text = readFileSync(join(packageRoot, file), "utf8");
		if (file === "README.md" || file === "skills/pi-multiagent/SKILL.md" || file === "skills/pi-multiagent/references/graph-cookbook.md") {
			if (!text.includes(requiredDefaultCopy)) failures.push(`${file}: must state timeoutSecondsPerStep ${requiredDefaultCopy}`);
		}
		for (const fragment of staleFragments) {
			if (text.toLowerCase().includes(fragment)) failures.push(`${file}: stale timeout contract copy ${JSON.stringify(fragment)}`);
		}
		for (const match of text.matchAll(explicitTimeoutPattern)) {
			const seconds = Number(match[1]);
			if (seconds < DEFAULT_TIMEOUT_SECONDS_PER_STEP) failures.push(`${file}:${lineNumberAt(text, match.index)} timeoutSecondsPerStep ${seconds} is below the ${DEFAULT_TIMEOUT_SECONDS_PER_STEP}-second default`);
		}
	}
}

function lineNumberAt(text: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index; i += 1) {
		if (text.charCodeAt(i) === 10) line += 1;
	}
	return line;
}

function requireFragments(file: string, text: string, fragments: string[]): void {
	for (const fragment of fragments) {
		if (!text.includes(fragment)) failures.push(`${file}: missing public contract invariant ${JSON.stringify(fragment)}`);
	}
}

function checkSkillReferenceShape(): void {
	const skill = readFileSync(join(packageRoot, "skills/pi-multiagent/SKILL.md"), "utf8");
	for (const target of ["[README](../../README.md)"]) {
		if (!skill.includes(target)) failures.push(`skills/pi-multiagent/SKILL.md: missing linked reference ${target}`);
	}
}

function checkPackageGalleryMetadata(): void {
	const parsed: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	if (!isObject(parsed) || !isObject(parsed.pi)) {
		failures.push("package.json: missing pi manifest object");
		return;
	}
	if (parsed.pi.image !== "https://unpkg.com/pi-multiagent/assets/pi-multiagent-gallery.webp") {
		failures.push("package.json: pi.image must point at the packaged gallery preview asset");
	}
	const assetPath = join(packageRoot, "assets", "pi-multiagent-gallery.webp");
	if (!existsSync(assetPath)) {
		failures.push("assets/pi-multiagent-gallery.webp: package-gallery image is missing");
		return;
	}
	const webp = readFileSync(assetPath);
	const isWebp = webp.length >= 30 && webp.subarray(0, 4).toString("ascii") === "RIFF" && webp.subarray(8, 12).toString("ascii") === "WEBP";
	if (!isWebp) {
		failures.push("assets/pi-multiagent-gallery.webp: package-gallery image must be WebP");
		return;
	}
	const chunk = webp.subarray(12, 16).toString("ascii");
	let width = 0;
	let height = 0;
	if (chunk === "VP8 ") {
		width = webp.readUInt16LE(26) & 0x3fff;
		height = webp.readUInt16LE(28) & 0x3fff;
	} else if (chunk === "VP8X") {
		width = webp.readUIntLE(24, 3) + 1;
		height = webp.readUIntLE(27, 3) + 1;
	} else if (chunk === "VP8L") {
		const b1 = webp[21];
		const b2 = webp[22];
		const b3 = webp[23];
		const b4 = webp[24];
		width = 1 + (((b2 & 0x3f) << 8) | b1);
		height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
	}
	if (width !== 1600 || height !== 1000) failures.push(`assets/pi-multiagent-gallery.webp: expected 1600x1000 preview, got ${width}x${height}`);
}

function checkGraduatedQuickstartAndCookbook(): void {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const skill = readFileSync(join(packageRoot, "skills/pi-multiagent/SKILL.md"), "utf8");
	const cookbook = readFileSync(join(packageRoot, "skills/pi-multiagent/references/graph-cookbook.md"), "utf8");
	requireFragments("README.md", readme, [
		"Run a package-backed review",
		"Try dependency handoff and synthesis",
		"Move reusable choreography into a file",
		"Copy and adapt a cookbook JSON file into the current workspace",
		"Packaged examples are references to copy and adapt",
		"Agents should use the skill for detailed invocation rules",
		"improving this package safely with agent teams",
		"Recurring inline roles can become reusable user or project catalog agents over time",
	]);
	requireFragments("skills/pi-multiagent/SKILL.md", skill, [
		"`README.md` is for humans",
		"This skill is for agents",
		"help improve `pi-multiagent` itself",
		"Keep README human/operator-facing",
		"Grow reusable catalogs deliberately",
	]);
	for (const graph of ["read-only-audit-fanout.json", "docs-examples-alignment.json", "implementation-review-gate.json", "research-to-change-gated-loop.json", "public-release-foundry.json"]) {
		requireFragments("README.md", readme, [graph]);
		requireFragments("skills/pi-multiagent/SKILL.md", skill, [graph]);
		requireFragments("skills/pi-multiagent/references/graph-cookbook.md", cookbook, [graph]);
	}
	const graphFilePackagePathPattern = /"graphFile"\s*:\s*"examples\/graphs\//;
	if (graphFilePackagePathPattern.test(readme)) failures.push("README.md: graphFile snippets must use copied workspace-local filenames, not package example paths");
	if (graphFilePackagePathPattern.test(cookbook)) failures.push("skills/pi-multiagent/references/graph-cookbook.md: graphFile snippets must use copied workspace-local filenames, not package example paths");
}
