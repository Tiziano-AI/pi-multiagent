import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	DEFAULT_CONCURRENCY,
	DEFAULT_MAX_RUN_SECONDS,
	DEFAULT_NOTIFY_MAX_NOTICES,
	DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS,
	DEFAULT_NOTIFY_MODE,
	DEFAULT_TERMINAL_RETENTION_SECONDS,
	DEFAULT_TIMEOUT_SECONDS_PER_STEP,
	MAX_AGENT_FILE_BYTES,
	MAX_CONCURRENCY,
	MAX_DEPENDENCIES_PER_STEP,
	MAX_EVENTS_PER_RUN,
	MAX_GRAPH_FILE_BYTES,
	MAX_LIVE_DETACHED_RUNS,
	MAX_MAX_RUN_SECONDS,
	MAX_NOTIFY_MAX_NOTICES,
	MAX_NOTIFY_MIN_INTERVAL_SECONDS,
	MAX_ASSISTANT_FINAL_MESSAGES_PER_STEP,
	MAX_PARENT_MESSAGE_CHARS_PER_STEP,
	MAX_PARENT_MESSAGES_PER_STEP,
	MAX_RETAINED_DETACHED_RUNS,
	MAX_STEP_OUTPUT_BYTES,
	MAX_RUN_STATUS_WAIT_SECONDS,
	MAX_STEPS,
	MAX_TERMINAL_RETENTION_SECONDS,
	MAX_TIMEOUT_SECONDS_PER_STEP,
	RPC_RECORD_MAX_CHARS,
} from "../extensions/multiagent/src/types.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageMetadata = readPackageMetadata();
const version = packageMetadata.version;
const packageFileAllowlist = packageMetadata.files;
const publicFiles = [
	"package.json",
	"README.md",
	"CHANGELOG.md",
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
checkCatalogIsAuthoritative();
checkRemovedTrustGateAndSourceScoringCopy();
checkPublicSurfaceOwnership();
checkActionSnippetHygiene();
checkTimeoutContract();
checkLimitsContract();
checkGraphExamples();
checkLocalControlPlaneDocs();
checkPackageGalleryMetadata();
checkReleaseHandoffContract();

assert.equal(failures.length, 0, `Public package portability checks failed:\n${failures.join("\n")}`);

function readPackageMetadata(): { version: string; files: string[] } {
	const parsed: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	if (!isObject(parsed) || typeof parsed.version !== "string") throw new Error("package.json must contain a string version");
	if (!Array.isArray(parsed.files) || !parsed.files.every((item) => typeof item === "string")) throw new Error("package.json files must be a string array");
	return { version: parsed.version, files: parsed.files };
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
		if (stats.isDirectory()) collectFilesInto(fullPath, extension, results);
		else if (stats.isFile() && fullPath.endsWith(extension)) results.push(relative(packageRoot, fullPath).split(sep).join("/"));
	}
}

function checkPortableText(file: string, text: string): void {
	for (const fragment of ["/" + "Users/", "/opt/" + "homebrew", "Code/" + "pi-multiagent", packageRoot, "is" + "Latest"]) {
		if (fragment.length > 0 && text.includes(fragment)) failures.push(`${file}: public package copy contains machine-local or unsupported fragment ${JSON.stringify(fragment)}`);
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
	for (const match of readme.matchAll(tagPattern)) if (match[1] !== version) failures.push(`README.md: pinned GitHub install tag v${match[1]} does not match package version v${version}`);
}

function checkCatalogIsAuthoritative(): void {
	for (const file of ["README.md", "skills/pi-multiagent/SKILL.md"]) {
		const text = readFileSync(join(packageRoot, file), "utf8");
		for (const fragment of ["authoritative", "catalog", "routing tags", "default built-in tool profiles"]) if (!text.includes(fragment)) failures.push(`${file}: missing catalog contract fragment ${JSON.stringify(fragment)}`);
	}
}

function checkRemovedTrustGateAndSourceScoringCopy(): void {
	const files = ["README.md", ...collectFiles("skills", ".md"), ...collectFiles("examples", ".json")];
	const banned = ["allowLocalSource", "allowUserSource", "allowProjectSource", "trustedSources", "source trust gate", "trust-gate", "local-source trust authority", "source-scoring", "source scoring", "source score", "file-path-scoring", "file-path scoring", "file path scoring", "rank by source", "rank by file path"];
	for (const file of files) {
		const text = readFileSync(join(packageRoot, file), "utf8");
		for (const fragment of banned) if (text.includes(fragment)) failures.push(`${file}: removed trust-gate/source-scoring copy is not public active copy: ${JSON.stringify(fragment)}`);
	}
}

function checkPublicSurfaceOwnership(): void {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const skill = readFileSync(join(packageRoot, "skills/pi-multiagent/SKILL.md"), "utf8");
	const cookbook = readFileSync(join(packageRoot, "skills/pi-multiagent/references/graph-cookbook.md"), "utf8");
	requireFragments("README.md", readme, ["human/operator path", "minimum read-only run", "First successful `graphFile` run", "local-read-only-graph.json", "Do not put `action`, `runId`, nested `graphFile`", "short process-local `runId`", "Cleanup is evidence deletion", "trusted shell execution", "trusted mutation execution", "release-readiness-review.json", "pnpm run gate"]);
	requireFragments("README.md", readme, ["pushed notices are compact human receipts", "terminal step artifact paths", "`agent_team:live` widget", "shared footer status row", "Assistant text previews require `preview:true`", "raw events require `debugEvents:true`"]);
	requireFragments("README.md", readme, ["structured `waitSeconds` receipt", "suppressed non-error activity", "Accepted means accepted for delivery to the live child", "explicit callable `exa_search` and `exa_fetch` `extensionTools`"]);
	requireFragments("README.md", readme, ["source and file path stay provenance, not ranking signals", "JSON/API/headless supervision", "pass the returned `Cursor` value back", "`package:validator` requires effective `bash`", "`package:worker` requires effective `edit` or `write`"]);
	requireFragments("README.md", readme, ["Every child process keeps at least the filesystem read/discovery suite", "effective tools/model lane", "launch time", "context overflow"]);
	requireFragments("README.md", readme, ["model/provider availability follows normal Pi extension discovery", "callable extension-tool grants", "Project and user library sources load when requested", "--agent-team-subagent-skills enabled|disabled"]);
	requireFragments("skills/pi-multiagent/SKILL.md", skill, ["Action controls are strict", "Tool-call pseudo-schema", "Graph step object, used inside `graph.steps[]` only", "Do not send `{\"action\":\"step\"}`", "First successful graphFile run", "short process-local `runId`", "Tool profile decision matrix", "Graph design ladder", "trusted shell execution", "trusted mutation execution", "Improving this package"]);
	requireFragments("skills/pi-multiagent/SKILL.md", skill, ["all terminal step artifact metadata", "bounded task previews", "run_status.stepId", "Pushed notices are compact untrusted human receipts", "`agent_team:live` widget", "shared footer status row", "Assistant text previews require `preview:true`", "raw events require `debugEvents:true`"]);
	requireFragments("skills/pi-multiagent/SKILL.md", skill, ["structured wait receipt", "suppressed non-error activity", "accepted-for-delivery transport", "source and file path are provenance only", "`package:validator` fails planning without effective `bash`", "`package:worker` fails planning without effective `edit` or `write`", "Planning fails before launch unless explicit callable web search/fetch grants match live catalog provenance"]);
	requireFragments("skills/pi-multiagent/references/graph-cookbook.md", cookbook, ["Choose a graph shape first", "Graph design ladder", "Task packet templates", "Parent graph packet", "Artifact handoff packet", "Partial evidence triage", "Web research with explicit catalog-copied provenance", "validation-matrix-gate.json"]);
	requireFragments("skills/pi-multiagent/references/graph-cookbook.md", cookbook, ["tree-reduce-source-review.json", "product-experience-source-audit.json", "evidence-trace-audit.json", "Product/evidence audit packet", "JSON/API/headless use"]);
	requireFragments("skills/pi-multiagent/references/graph-cookbook.md", cookbook, ["Copy/adapt warning", "graphFile", "trusted shell execution", "trusted mutation execution", "Add `preview:true` only when bounded assistant text belongs", "Use `debugEvents:true` only for package debugging", "Every child keeps mandatory read/discovery", "--agent-team-subagent-skills enabled|disabled"]);
}

function requireFragments(file: string, text: string, fragments: string[]): void {
	for (const fragment of fragments) if (!text.includes(fragment)) failures.push(`${file}: missing active contract fragment ${JSON.stringify(fragment)}`);
}

function checkActionSnippetHygiene(): void {
	for (const file of ["README.md", "skills/pi-multiagent/SKILL.md", "skills/pi-multiagent/references/graph-cookbook.md", ...collectFiles("examples", ".json")]) {
		const text = readFileSync(join(packageRoot, file), "utf8");
		if (text.includes('"cursor": "0"')) failures.push(`${file}: routine run_status snippets use prior run_status cursors only when demonstrating debug backfill`);
		if (text.includes("agt_REPLACE_WITH_START_RUN_ID") || /"runId"\s*:\s*"agt_/.test(text)) failures.push(`${file}: public runId snippets use short handles such as r1`);
	}
}

function checkTimeoutContract(): void {
	const checkedFiles = ["README.md", ...collectFiles("examples", ".json"), ...collectFiles("skills", ".md")];
	const requiredDefaultCopy = `defaults to ${DEFAULT_TIMEOUT_SECONDS_PER_STEP} seconds`;
	const explicitTimeoutPattern = /"timeoutSecondsPerStep"\s*:\s*([0-9]+)/g;
	for (const file of checkedFiles) {
		const text = readFileSync(join(packageRoot, file), "utf8");
		if (["README.md", "skills/pi-multiagent/SKILL.md", "skills/pi-multiagent/references/graph-cookbook.md"].includes(file) && !text.includes(requiredDefaultCopy)) failures.push(`${file}: missing timeoutSecondsPerStep ${requiredDefaultCopy}`);
		for (const match of text.matchAll(explicitTimeoutPattern)) {
			const seconds = Number(match[1]);
			if (seconds < DEFAULT_TIMEOUT_SECONDS_PER_STEP) failures.push(`${file}:${lineNumberAt(text, match.index)} timeoutSecondsPerStep ${seconds} is below the ${DEFAULT_TIMEOUT_SECONDS_PER_STEP}-second default`);
		}
	}
}

function checkLimitsContract(): void {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const fragments = [
		`| Steps | ${MAX_STEPS} |`,
		`| Dependencies per step | ${MAX_DEPENDENCIES_PER_STEP} |`,
		`| Concurrency | 1 to ${MAX_CONCURRENCY}; default ${DEFAULT_CONCURRENCY} |`,
		`1 to ${MAX_TIMEOUT_SECONDS_PER_STEP} seconds; \`timeoutSecondsPerStep\` defaults to ${DEFAULT_TIMEOUT_SECONDS_PER_STEP} seconds`,
		`1 to ${MAX_MAX_RUN_SECONDS} seconds; default ${DEFAULT_MAX_RUN_SECONDS} seconds`,
		`1 to ${MAX_TERMINAL_RETENTION_SECONDS} seconds; default ${DEFAULT_TERMINAL_RETENTION_SECONDS} seconds`,
		`\`waitSeconds\` max ${MAX_RUN_STATUS_WAIT_SECONDS} seconds`,
		`| Live detached runs | ${MAX_LIVE_DETACHED_RUNS} live runs per extension process; completion or cancel frees live capacity |`,
		`| Retained detached runs | ${MAX_RETAINED_DETACHED_RUNS} retained runs per extension process, including live and terminal runs; cleanup frees only terminal retained runs |`,
		`default \`${DEFAULT_NOTIFY_MODE}\`; max ${MAX_NOTIFY_MAX_NOTICES} non-terminal notices; default ${DEFAULT_NOTIFY_MAX_NOTICES}; minimum interval default ${DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS} seconds, max ${MAX_NOTIFY_MIN_INTERVAL_SECONDS}`,
		`Relative \`.json\` file inside cwd; ${MAX_GRAPH_FILE_BYTES / 1024} KiB max`,
		`| Agent file input | ${MAX_AGENT_FILE_BYTES / 1024} KiB per library agent Markdown file |`,
		`| Retained events per run | ${MAX_EVENTS_PER_RUN} |`,
		`| Parent message budget per live step | ${MAX_PARENT_MESSAGES_PER_STEP} message attempts or ${MAX_PARENT_MESSAGE_CHARS_PER_STEP} sent message chars |`,
		`| Retained assistant output per step | ${MAX_STEP_OUTPUT_BYTES} bytes across non-empty assistant finals; max ${MAX_ASSISTANT_FINAL_MESSAGES_PER_STEP} non-empty assistant finals |`,
		`| RPC JSONL record parse cap | ${RPC_RECORD_MAX_CHARS / 1024 / 1024} MiB |`,
	];
	for (const fragment of fragments) if (!readme.includes(fragment)) failures.push(`README.md: missing runtime limit copy ${JSON.stringify(fragment)}`);
}

function checkGraphExamples(): void {
	for (const file of collectFiles("examples", ".json")) {
		const parsed: unknown = JSON.parse(readFileSync(join(packageRoot, file), "utf8"));
		if (!isObject(parsed)) {
			failures.push(`${file}: graph example must be a JSON object`);
			continue;
		}
		for (const key of ["action", "agents", "synthesis", "outputContract", "runId", "graphFile"]) if (parsed[key] !== undefined) failures.push(`${file}: graph example is a pure detached graph; remove ${key}`);
		if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) failures.push(`${file}: graph example must include steps`);
		if (file === "examples/graphs/release-readiness-review.json") checkReleaseReadinessExample(file, parsed);
		if (file === "examples/graphs/map-reduce-audit-fanout.json") checkMapReduceExample(file, parsed);
	}
}

function checkReleaseReadinessExample(file: string, graph: { [key: string]: unknown }): void {
	const authority = graph.authority;
	if (!isObject(authority) || authority.allowFilesystemRead !== true || authority.allowShellTools !== true || authority.allowMutationTools === true) failures.push(`${file}: release-readiness graph uses read and shell authority only`);
	if (!isObject(graph.limits) || graph.limits.concurrency !== 1) failures.push(`${file}: release-readiness graph serializes shell proof lanes`);
	if (stepAgentRef(file, graph, "release-map") !== "package:scout") failures.push(`${file}: release-map uses package:scout for file release mapping`);
	if (stepAgentRef(file, graph, "release-proof") !== "package:validator") failures.push(`${file}: release-proof uses package:validator for command-backed release proof`);
	const auditAfter = stepStringArray(file, graph, "release-audit", "after");
	if (auditAfter.join(",") !== "release-map,release-proof") failures.push(`${file}: release-audit waits after release-map and release-proof`);
	const decisionAfter = stepStringArray(file, graph, "readiness-decision", "after");
	if (decisionAfter.join(",") !== "release-map,release-proof,release-audit") failures.push(`${file}: readiness-decision preserves terminal evidence from every release lane`);
	for (const fragment of ["git status -sb", "pnpm run gate", "npm pack --dry-run --json", "git diff --check"]) if (!stepTask(file, graph, "release-proof").includes(fragment)) failures.push(`${file}: release-proof task includes ${fragment}`);
}

function checkMapReduceExample(file: string, graph: { [key: string]: unknown }): void {
	for (const stepId of ["map-runtime", "map-docs", "map-tests"]) {
		const task = stepTask(file, graph, stepId);
		if (!task.includes("concrete delegated question")) failures.push(`${file}:${stepId} references the concrete delegated question`);
		if (!task.includes("surface, owner or canonical path, evidence, risk or mismatch, validation gap, and smallest next action")) failures.push(`${file}:${stepId} preserves mapper output packet fields`);
	}
	const reduceTask = stepTask(file, graph, "reduce-decision");
	if (!reduceTask.includes("reducer packet") || !reduceTask.includes("observed validation versus claimed validation")) failures.push(`${file}: reducer preserves decision packet fields and validation distinction`);
}

function stepAgentRef(file: string, graph: { [key: string]: unknown }, id: string): string {
	const step = exampleStep(file, graph, id);
	return isObject(step.agent) && typeof step.agent.ref === "string" ? step.agent.ref : "";
}

function stepTask(file: string, graph: { [key: string]: unknown }, id: string): string {
	const task = exampleStep(file, graph, id).task;
	return typeof task === "string" ? task : "";
}

function stepStringArray(file: string, graph: { [key: string]: unknown }, id: string, key: string): string[] {
	const value = exampleStep(file, graph, id)[key];
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function exampleStep(file: string, graph: { [key: string]: unknown }, id: string): { [key: string]: unknown } {
	const steps = graph.steps;
	if (!Array.isArray(steps)) return {};
	const step = steps.find((candidate): candidate is { [key: string]: unknown } => isObject(candidate) && candidate.id === id);
	if (!step) failures.push(`${file}: missing graph step ${id}`);
	return step ?? {};
}

function checkLocalControlPlaneDocs(): void {
	for (const file of ["ARCH.md", "TODO.md", "VISION.md"]) {
		if (existsSync(join(packageRoot, file))) failures.push(`${file}: root public-planning notes are outside package source truth`);
	}
	for (const file of ["AGENTS.md", "CONTINUE.md", "HANDOFF.md", "PLAN.md"]) {
		if (!existsSync(join(packageRoot, file))) continue;
		if (publicFiles.includes(file) || packageAllowlistCouldIncludeRootFile(file)) failures.push(`${file}: local control-plane docs stay out of package.json files`);
	}
}

function packageAllowlistCouldIncludeRootFile(file: string): boolean {
	return packageFileAllowlist.some((pattern) => rootPackagePatternMatches(pattern, file));
}

function rootPackagePatternMatches(pattern: string, file: string): boolean {
	if (pattern === file || pattern === "." || pattern === "*" || pattern === "**" || pattern === "**/*") return true;
	if (pattern.includes("/")) return false;
	if (!pattern.includes("*")) return false;
	return globSegmentPattern(pattern).test(file);
}

function globSegmentPattern(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
	return new RegExp(`^${escaped}$`);
}

function checkReleaseHandoffContract(): void {
	const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
	const releaseReadiness = readFileSync(join(packageRoot, "examples/graphs/release-readiness-review.json"), "utf8");
	const parsed: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	if (!isObject(parsed)) {
		failures.push("package.json: release guardrail contract requires object metadata");
		return;
	}
	const smokeCommandIndex = readme.indexOf("PI_MULTIAGENT_REAL_SMOKE=1 PI_MULTIAGENT_REAL_SMOKE_TIMEOUT_MS=180000 pnpm run smoke:pi");
	const smokeApprovalIndex = readme.indexOf("Run it only with explicit operator approval");
	if (smokeCommandIndex === -1 || smokeApprovalIndex === -1 || Math.abs(smokeCommandIndex - smokeApprovalIndex) > 300) failures.push("README.md: real-runtime smoke command keeps explicit operator approval caveat adjacent");
	for (const fragment of ["not-executed human-owned next actions", "npm publish", "GitHub Release creation", "gh release view verification"]) if (!releaseReadiness.includes(fragment)) failures.push(`examples/graphs/release-readiness-review.json: readiness decision includes ${fragment}`);
	if (parsed.packageManager !== "pnpm@11.1.2") failures.push("package.json: packageManager pins the release package manager used by this repository");
	if (!isObject(parsed.engines) || typeof parsed.engines.node !== "string") failures.push("package.json: engines.node documents supported runtime floor");
	if (!isObject(parsed.publishConfig) || parsed.publishConfig.access !== "public") failures.push("package.json: publishConfig.access remains public for npm package metadata");
}

function checkPackageGalleryMetadata(): void {
	const parsed: unknown = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	if (!isObject(parsed) || !isObject(parsed.pi)) {
		failures.push("package.json: pi package metadata is required");
		return;
	}
	const pi = parsed.pi;
	if (typeof pi.image !== "string" || !pi.image.includes("pi-multiagent-gallery.webp")) failures.push("package.json: pi.image must point at the package gallery asset");
	if (!existsSync(join(packageRoot, "assets", "pi-multiagent-gallery.webp"))) failures.push("assets/pi-multiagent-gallery.webp: gallery image file must be packaged");
}

function lineNumberAt(text: string, index: number | undefined): number {
	if (index === undefined) return 1;
	return text.slice(0, index).split("\n").length;
}
