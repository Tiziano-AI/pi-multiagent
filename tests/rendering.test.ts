import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
import { formatAgentTeamNoticeText, renderAgentTeamCall, renderAgentTeamLiveRunsWidget, renderAgentTeamNoticeMessage, renderAgentTeamResult } from "../extensions/multiagent/src/rendering.ts";
import type { AgentTeamDetails, RunSnapshot, StepSnapshot, StepStatus } from "../extensions/multiagent/src/types.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("production code routes live progress through the agent_team widget and notices", () => {
	for (const file of productionFiles(join(packageRoot, "extensions", "multiagent", "src"))) {
		const source = readFileSync(file, "utf8");
		assert.doesNotMatch(source, /\bctx\.ui\.setStatus\b/, `${file}: use agent_team:live widget and notices, not Pi's shared footer status row`);
	}
	const entrypoint = readFileSync(join(packageRoot, "extensions", "multiagent", "index.ts"), "utf8");
	assert.doesNotMatch(entrypoint, /ctx\.ui\.setStatus\((?!FOOTER_COST_FLAG)/, "index.ts setStatus calls must use FOOTER_COST_FLAG");
});

test("renderAgentTeamCall summarizes detached actions", () => {
	assert.match(renderAgentTeamCall({ action: "start", graph: { objective: "x", steps: [{ id: "one", agent: { system: "x" }, task: "x" }] } }, theme, undefined).render(120).join("\n"), /launch 1 step/);
	assert.match(renderAgentTeamCall({ action: "run_status", runId: "r1" }, theme, undefined).render(120).join("\n"), /status/);
	assert.match(renderAgentTeamCall({ action: "cancel", runId: "r1" }, theme, undefined).render(120).join("\n"), /stop run/);
	assert.match(renderAgentTeamCall({ action: "cleanup", runId: "r1" }, theme, undefined).render(120).join("\n"), /delete evidence/);
});

test("renderAgentTeamResult reports catalog and run state", () => {
	const catalog = details("catalog", { catalog: [{ name: "reviewer", ref: "package:reviewer", source: "package", description: "Review", tags: ["review"], tools: undefined, model: undefined, thinking: undefined, filePath: "/tmp/reviewer.md", sha256: "abc" }] });
	assert.match(renderAgentTeamResult({ content: [], details: catalog }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n"), /1 agent/);
	const started = details("start", { run: run({ objective: "detached", liveStepIds: ["one"], sinkStepIds: ["one"], lastEvent: "one: start", counts: counts({ running: 1 }) }) });
	const rendered = renderAgentTeamResult({ content: [], details: started }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /agent_team started detached/);
	assert.match(rendered, /0\/1 complete {2}1 working/);
	assert.match(rendered, /last update one: start/);
	assert.doesNotMatch(rendered, /objective|active=|sinks=|Can:|cursor|cleanup=true|updated|Artifact:/i);
});

test("renderAgentTeamResult surfaces run_status wait receipts", () => {
	const status = details("run_status", {
		run: run({ objective: "detached", liveStepIds: ["one"], sinkStepIds: ["one"], counts: counts({ running: 1 }) }),
		wait: { requestedSeconds: 30, outcome: "timeout", stepId: "one", cursorBefore: "4", cursorAfter: "4" },
	});
	const rendered = renderAgentTeamResult({ content: [], details: status }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /wait timeout one 30s cursor 4->4/);
	const plain = formatAgentTeamNoticeText(status);
	assert.match(plain, /wait timeout one 30s cursor 4->4/);
});

test("renderAgentTeamResult renders cancel as a human stop receipt", () => {
	const canceling = details("cancel", {
		run: run({ objective: "Adversarial read-only review of the entire pending pi-multiagent working-tree changeset", status: "canceling", liveStepIds: ["runtime-safety", "docs-contracts", "tests-packaging", "tui-human"], sinkStepIds: ["runtime-safety", "docs-contracts", "tests-packaging", "tui-human"], lastEvent: "tui-human: terminalizing [canceled]", counts: counts({ running: 4 }) }),
		steps: [
			step({ id: "runtime-safety", agentRef: "inline:runtime-safety", status: "running", lastActivity: "child prompt sent" }),
			step({ id: "docs-contracts", agentRef: "inline:docs-contracts", status: "running", lastActivity: "child prompt sent" }),
			step({ id: "tests-packaging", agentRef: "inline:tests-packaging", status: "running", lastActivity: "child prompt sent" }),
			step({ id: "tui-human", agentRef: "inline:tui-human", status: "running", lastActivity: "terminalizing [canceled]" }),
		],
	});
	const rendered = renderAgentTeamResult({ content: [], details: canceling }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /agent_team stop requested r1/);
	assert.match(rendered, /0\/4 complete {2}4 working/);
	assert.match(rendered, /working now runtime-safety prompt sent; \+3 more lanes/);
	assert.match(rendered, /last update tui-human: terminalizing \[canceled\]/);
	assert.doesNotMatch(rendered, /cancel canceling|objective|active=|sinks=/i);
});

test("renderAgentTeamLiveRunsWidget renders a readable live operator panel", () => {
	const started = details("start", {
		run: run({ objective: "TUI rewrite", liveStepIds: ["audit"], sinkStepIds: ["audit"], counts: counts({ running: 1 }) }),
		steps: [step({ id: "audit", agentRef: "package:scout", status: "running", lastActivity: "assistant writing" })],
	});
	const lines = renderAgentTeamLiveRunsWidget([started], theme).render(120);
	assert.deepEqual(lines, ["agent_team running TUI rewrite", "[--------------] 0/1 complete  1 working", "working now", "  > scout writing"]);
	assert.doesNotMatch(lines.join("\n"), /objective|active=|sinks=|run_status|step_result|cleanup|cursor|debugEvents|Artifact:|\/tmp\//i);
});

test("renderAgentTeamLiveRunsWidget surfaces active roles and queued work without control vocabulary", () => {
	const live = details("run_status", {
		run: run({ objective: "Human TUI operator HUD", liveStepIds: ["audit", "docs"], sinkStepIds: ["final"], counts: counts({ pending: 1, running: 2, succeeded: 1 }) }),
		steps: [
			step({ id: "audit", agentRef: "package:scout", status: "running", lastActivity: "assistant writing" }),
			step({ id: "docs", agentRef: "package:docs-auditor", status: "running", lastActivity: "tool rg running" }),
			step({ id: "final", agentRef: "package:synthesizer", status: "pending" }),
		],
	});
	const rendered = renderAgentTeamLiveRunsWidget([live], theme).render(120).join("\n");
	assert.match(rendered, /1\/4 complete {2}2 working {2}1 queued/);
	assert.match(rendered, /working now\n {2}> scout writing\n {2}> docs-auditor rg running/);
	assert.match(rendered, /queued next synthesizer/);
	assert.doesNotMatch(rendered, /run_status|step_result|cleanup|cursor|debugEvents|Artifact:/i);
});

test("renderAgentTeamLiveRunsWidget lets attention outrank objective text", () => {
	const problem = details("run_status", {
		run: run({ objective: "This long objective should not outrank the failure because the human needs the issue first", liveStepIds: ["worker"], sinkStepIds: ["worker"], counts: counts({ running: 1, failed: 1, succeeded: 3 }) }),
		steps: [
			step({ id: "validator", agentRef: "package:validator", status: "failed", errorMessage: "typecheck failed" }),
			step({ id: "worker", agentRef: "package:worker", status: "running", lastActivity: "assistant writing" }),
		],
	});
	const rendered = renderAgentTeamLiveRunsWidget([problem], theme).render(120).join("\n");
	assert.match(rendered, /agent_team attention/);
	assert.match(rendered, /4\/5 complete {2}1 failed {2}1 working/);
	assert.match(rendered, /needs attention\n {2}! validator typecheck failed/);
	assert.doesNotMatch(rendered, /long objective/i);
});

test("renderAgentTeamLiveRunsWidget distinguishes multiple live runs", () => {
	const first = details("run_status", {
		run: run({ runId: "r1", objective: "TUI rewrite", liveStepIds: ["review"], counts: counts({ running: 1, succeeded: 2 }) }),
		steps: [step({ id: "review", agentRef: "package:reviewer", status: "running", lastActivity: "assistant writing" })],
	});
	const second = details("run_status", {
		run: run({ runId: "r2", objective: "Release proof", liveStepIds: ["fix"], counts: counts({ running: 1, failed: 1 }) }),
		steps: [step({ id: "validator", agentRef: "package:validator", status: "failed", errorMessage: "gate failed" }), step({ id: "fix", agentRef: "package:worker", status: "running", lastActivity: "tool read running" })],
	});
	const third = details("run_status", {
		run: run({ runId: "r3", objective: "Docs audit", liveStepIds: ["docs"], counts: counts({ running: 1 }) }),
		steps: [step({ id: "docs", agentRef: "package:docs-auditor", status: "running", lastActivity: "assistant writing" })],
	});
	const rendered = renderAgentTeamLiveRunsWidget([first, second, third], theme).render(120).join("\n");
	assert.match(rendered, /agent_team 3 runs {2}1 need attention/);
	assert.match(rendered, /! Release proof 1\/2 complete {2}1 failed {2}1 working validator failed: gate failed/);
	assert.match(rendered, /> TUI rewrite 2\/3 complete {2}1 working reviewer writing/);
	assert.match(rendered, /> Docs audit 0\/1 complete {2}1 working docs-auditor writing/);
});

test("renderAgentTeamLiveRunsWidget fits narrow widths", () => {
	const live = details("run_status", {
		run: run({ objective: "Very long objective that should never force lines wider than the terminal width", liveStepIds: ["audit", "docs", "review"], counts: counts({ pending: 1, running: 3, succeeded: 2 }) }),
		steps: [
			step({ id: "audit", agentRef: "package:scout", status: "running", lastActivity: "assistant writing with a long note" }),
			step({ id: "docs", agentRef: "package:docs-auditor", status: "running", lastActivity: "tool grep running" }),
			step({ id: "review", agentRef: "package:reviewer", status: "running", lastActivity: "model turn active (no output yet)" }),
		],
	});
	for (const width of [40, 60, 80, 120]) {
		const lines = renderAgentTeamLiveRunsWidget([live], theme).render(width);
		for (const line of lines) assert.equal(visibleWidth(line) <= width, true, `${visibleWidth(line)} > ${width}: ${line}`);
	}
});

test("renderAgentTeamResult keeps run context for run-backed errors", () => {
	const denied = details("message", {
		ok: false,
		error: { code: "message-not-delivered", message: "Step is not live or messageable." },
		run: run({ objective: "detached", liveStepIds: [], sinkStepIds: ["one"], lastEvent: "one: finish", counts: counts({ succeeded: 1 }) }),
		message: { runId: "r1", stepId: "one", channel: "steer", clientMessageId: "m", accepted: false, undeliveredReason: "Step is not live or messageable." },
	});
	const rendered = renderAgentTeamResult({ content: [], details: denied }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /agent_team message denied r1/);
	assert.match(rendered, /needs attention/);
	assert.match(rendered, /message-not-delivered/);
	assert.match(rendered, /message one Step is not live or messageable/);
	assert.doesNotMatch(rendered, /^message error message-not-delivered$/m);
});

test("renderAgentTeamResult expanded mode can show effective tools", () => {
	const started = details("start", {
		run: run({ objective: "detached", liveStepIds: ["audit"], sinkStepIds: ["audit"], lastEvent: "audit: start", counts: counts({ running: 1 }) }),
		steps: [step({ id: "audit", agentRef: "package:scout", status: "running", effectiveTools: ["read", "grep", "find", "ls", "bash"] })],
	});
	const rendered = renderAgentTeamResult({ content: [], details: started }, { expanded: true, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /tools audit=read,grep,find,ls,bash/);
});

test("renderAgentTeamResult labels running step_result output as live", () => {
	const live = details("step_result", {
		run: run({ objective: "detached", liveStepIds: ["one"], sinkStepIds: ["one"], lastEvent: "one: text", counts: counts({ running: 1 }) }),
		outputs: [{ stepId: "one", status: "running", text: "partial", filePath: undefined, chars: 7 }],
	});
	const rendered = renderAgentTeamResult({ content: [], details: live }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /live output one running/);
	assert.doesNotMatch(rendered, /final output one running/);
});

test("renderAgentTeamResult summarizes pushed notices with visible artifacts", () => {
	const notice = details("run_status", {
		run: run({ objective: "detached", status: "succeeded", terminal: true, liveStepIds: [], sinkStepIds: ["one"], lastEvent: "terminal: succeeded", expiresAt: "2030-01-01T00:00:00.000Z", canMessage: false, canCancel: false, canCleanup: true, counts: counts({ succeeded: 1 }) }),
		outputs: [{ stepId: "one", status: "succeeded", text: undefined, filePath: "/tmp/one-final.md", chars: 100 }],
		notice: { runId: "r1", mode: "milestones", terminal: true, reasons: ["terminal:succeeded"], noticeCount: 1, noticeLimitReached: false },
	});
	const rendered = renderAgentTeamResult({ content: [], details: notice }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /terminal notice terminal:succeeded/);
	assert.match(rendered, /artifactPaths=one=\/tmp\/one-final\.md/);
	assert.match(rendered, /expiresAt=2030-01-01T00:00:00\.000Z/);
	const fallback = formatAgentTeamNoticeText(notice);
	assert.match(fallback, /agent_team succeeded detached/);
	assert.match(fallback, /runId=r1/);
	assert.match(fallback, /final evidence one succeeded one-final.md/);
	assert.match(fallback, /artifact paths one=\/tmp\/one-final\.md/);
	assert.match(fallback, /expiresAt=2030-01-01T00:00:00\.000Z/);
	assert.match(fallback, /untrusted status evidence; run_status\/step_result for artifacts/);
	assert.doesNotMatch(fallback, /# agent_team|Objective:|Run:|Status:|Exceptional controls|Next:|artifact=|cleanup|cursor|debugEvents|Artifact:/i);
	const noticeCard = renderAgentTeamNoticeMessage(notice, fallback, { expanded: false }, theme).render(120).join("\n");
	assert.match(noticeCard, /agent_team succeeded detached/);
	assert.match(noticeCard, /\/tmp\/one-final\.md/);
	assert.match(noticeCard, /expiresAt=2030-01-01T00:00:00\.000Z/);
	assert.doesNotMatch(noticeCard, /Objective:|Run:|Exceptional controls|run_status|step_result|cleanup|cursor|debugEvents/i);
	const missingDetailsCard = renderAgentTeamNoticeMessage(undefined, fallback, { expanded: false }, theme).render(120).join("\n");
	assert.match(missingDetailsCard, /agent_team succeeded detached/);
	assert.match(missingDetailsCard, /untrusted status evidence; run_status\/step_result for artifacts/);
});

test("renderAgentTeamResult terminal notices surface upstream terminal artifact paths", () => {
	const notice = details("run_status", {
		run: run({ objective: "detached", status: "succeeded", terminal: true, liveStepIds: [], sinkStepIds: ["sink"], lastEvent: "terminal: succeeded", expiresAt: "2030-01-01T00:00:00.000Z", canMessage: false, canCancel: false, canCleanup: true, counts: counts({ succeeded: 2 }) }),
		steps: [
			step({ id: "upstream", agentRef: "inline:upstream", status: "succeeded", outputFilePath: "/tmp/upstream-final.md", outputChars: 11 }),
			step({ id: "sink", agentRef: "inline:sink", status: "succeeded", needs: ["upstream"], outputFilePath: "/tmp/sink-final.md", outputChars: 9 }),
		],
		outputs: [{ stepId: "sink", status: "succeeded", text: undefined, filePath: "/tmp/sink-final.md", chars: 9 }],
		notice: { runId: "r1", mode: "milestones", terminal: true, reasons: ["terminal:succeeded"], noticeCount: 1, noticeLimitReached: false },
	});
	const rendered = renderAgentTeamResult({ content: [], details: notice }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /artifactPaths=sink=\/tmp\/sink-final\.md, upstream=\/tmp\/upstream-final\.md/);
	const fallback = formatAgentTeamNoticeText(notice);
	assert.match(fallback, /final evidence sink succeeded sink-final\.md/);
	assert.match(fallback, /artifact paths sink=\/tmp\/sink-final\.md, upstream=\/tmp\/upstream-final\.md/);
});

test("renderAgentTeamResult terminal notices cap large artifact path lists", () => {
	const notice = details("run_status", {
		run: run({ objective: "detached", status: "succeeded", terminal: true, liveStepIds: [], sinkStepIds: ["sink"], lastEvent: "terminal: succeeded", expiresAt: "2030-01-01T00:00:00.000Z", canMessage: false, canCancel: false, canCleanup: true, counts: counts({ succeeded: 5 }) }),
		steps: [
			step({ id: "a", agentRef: "inline:a", status: "succeeded", outputFilePath: "/tmp/a-final.md", outputChars: 1 }),
			step({ id: "b", agentRef: "inline:b", status: "succeeded", outputFilePath: "/tmp/b-final.md", outputChars: 1 }),
			step({ id: "sink", agentRef: "inline:sink", status: "succeeded", outputFilePath: "/tmp/sink-final.md", outputChars: 1 }),
			step({ id: "c", agentRef: "inline:c", status: "succeeded", outputFilePath: "/tmp/c-final.md", outputChars: 1 }),
			step({ id: "d", agentRef: "inline:d", status: "succeeded", outputFilePath: "/tmp/d-final.md", outputChars: 1 }),
		],
		outputs: [{ stepId: "sink", status: "succeeded", text: undefined, filePath: "/tmp/sink-final.md", chars: 1 }],
		notice: { runId: "r1", mode: "milestones", terminal: true, reasons: ["terminal:succeeded"], noticeCount: 1, noticeLimitReached: false },
	});
	const fallback = formatAgentTeamNoticeText(notice);
	assert.match(fallback, /artifact paths sink=\/tmp\/sink-final\.md, a=\/tmp\/a-final\.md, b=\/tmp\/b-final\.md, \+2 more; use run_status\/step_result/);
	assert.doesNotMatch(fallback, /c-final|d-final/);
	const rendered = renderAgentTeamResult({ content: [], details: notice }, { expanded: false, isPartial: false }, theme, undefined).render(160).join("\n");
	assert.match(rendered, /artifactPaths=sink=\/tmp\/sink-final\.md, a=\/tmp\/a-final\.md, b=\/tmp\/b-final\.md, \+2 more; use run_status\/step_result/);
	const expanded = renderAgentTeamResult({ content: [], details: notice }, { expanded: true, isPartial: false }, theme, undefined).render(160).join("\n");
	assert.match(expanded, /artifacts sink=\/tmp\/sink-final\.md, a=\/tmp\/a-final\.md, b=\/tmp\/b-final\.md, \+2 more; use run_status\/step_result/);
	assert.doesNotMatch(expanded, /c-final|d-final/);
});

test("renderAgentTeamResult keeps milestone notices compact", () => {
	const notice = details("run_status", {
		run: run({ objective: "detached", status: "running", terminal: false, liveStepIds: ["one"], sinkStepIds: ["one"], lastEvent: "sink one running", counts: counts({ running: 1 }) }),
		outputs: [{ stepId: "one", status: "running", text: undefined, filePath: "/tmp/one-live.md", chars: 100 }],
		notice: { runId: "r1", mode: "milestones", terminal: false, reasons: ["sink one running"], noticeCount: 1, noticeLimitReached: false },
	});
	const rendered = renderAgentTeamResult({ content: [], details: notice }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /milestone notice sink one running/);
	assert.match(rendered, /artifacts=one-live\.md/);
	assert.doesNotMatch(rendered, /artifactPaths=|\/tmp\/one-live\.md|expiresAt=/);
});

test("renderAgentTeamResult summarizes multiple sink finals", () => {
	const terminal = details("run_status", {
		run: run({ objective: "detached", status: "succeeded", terminal: true, liveStepIds: [], sinkStepIds: ["one", "two"], lastEvent: "terminal: succeeded", canMessage: false, canCancel: false, canCleanup: true, counts: counts({ succeeded: 2 }) }),
		outputs: [
			{ stepId: "one", status: "succeeded", text: "one", filePath: "/tmp/one.md", chars: 3 },
			{ stepId: "two", status: "failed", text: "two", filePath: "/tmp/two.md", chars: 3 },
		],
	});
	const rendered = renderAgentTeamResult({ content: [], details: terminal }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /final outputs 2/);
	assert.match(rendered, /one succeeded, two failed/);
});

test("renderAgentTeamResult reports cleanup as evidence deletion", () => {
	const cleanup = details("cleanup", {
		run: run({ objective: "detached", status: "succeeded", terminal: true, liveStepIds: [], sinkStepIds: ["one"], canMessage: false, canCancel: false, canCleanup: false, counts: counts({ succeeded: 1 }) }),
		cleanup: { runId: "r1", deletedPaths: ["/tmp/one-final.md"] },
	});
	const rendered = renderAgentTeamResult({ content: [], details: cleanup }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /agent_team evidence deleted/);
	assert.match(rendered, /evidence deleted 1 retained path/);
	const plain = formatAgentTeamNoticeText(cleanup);
	assert.match(plain, /agent_team evidence deleted/);
	assert.match(plain, /evidence deleted 1 retained path/);
	assert.doesNotMatch(plain, /run_status|step_result|artifacts/);
});

test("renderAgentTeamResult reports actual cleanup receipt shape without run snapshot", () => {
	const cleanup = details("cleanup", {
		cleanup: { runId: "r1", deletedPaths: ["/tmp/one-final.md", "/tmp/run"] },
	});
	const rendered = renderAgentTeamResult({ content: [], details: cleanup }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /agent_team evidence deleted r1/);
	assert.match(rendered, /evidence deleted 2 retained path/);
	assert.doesNotMatch(rendered, /cleanup ok|no run/);
	const plain = formatAgentTeamNoticeText(cleanup);
	assert.match(plain, /agent_team evidence deleted r1/);
	assert.match(plain, /evidence deleted 2 retained path/);
	assert.doesNotMatch(plain, /run_status|step_result|artifacts/);
});

test("renderAgentTeamResult keeps cleanup denial distinct from evidence deletion", () => {
	const denied = details("cleanup", {
		ok: false,
		error: { code: "cleanup-run-live", message: "Cleanup is denied while the run is live." },
		run: run({ objective: "detached", liveStepIds: ["one"], sinkStepIds: ["one"], lastEvent: "one: running", counts: counts({ running: 1 }) }),
	});
	const rendered = renderAgentTeamResult({ content: [], details: denied }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /agent_team cleanup denied r1/);
	assert.match(rendered, /cleanup-run-live/);
	assert.match(rendered, /cleanup cleanup-run-live/);
	assert.doesNotMatch(rendered, /evidence deleted/);
	const plain = formatAgentTeamNoticeText(denied);
	assert.match(plain, /agent_team cleanup denied r1/);
	assert.match(plain, /cleanup cleanup-run-live/);
	assert.doesNotMatch(plain, /evidence deleted/);
});

test("renderAgentTeamResult keeps cleanup failure distinct from evidence deletion", () => {
	const failed = details("cleanup", {
		ok: false,
		error: { code: "cleanup-artifacts-failed", message: "Cleanup failed while deleting retained artifacts: permission denied" },
		run: run({ objective: "detached", status: "succeeded", terminal: true, liveStepIds: [], sinkStepIds: ["one"], lastEvent: "terminal: succeeded", canMessage: false, canCancel: false, canCleanup: true, counts: counts({ succeeded: 1 }) }),
	});
	const rendered = renderAgentTeamResult({ content: [], details: failed }, { expanded: false, isPartial: false }, theme, undefined).render(120).join("\n");
	assert.match(rendered, /agent_team cleanup failed r1/);
	assert.match(rendered, /cleanup-artifacts-failed/);
	assert.match(rendered, /cleanup cleanup-artifacts-failed/);
	assert.doesNotMatch(rendered, /evidence deleted/);
	const plain = formatAgentTeamNoticeText(failed);
	assert.match(plain, /agent_team cleanup failed r1/);
	assert.match(plain, /cleanup cleanup-artifacts-failed/);
	assert.doesNotMatch(plain, /evidence deleted/);
});

function productionFiles(root: string): string[] {
	const entries = readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) files.push(...productionFiles(path));
		else if (entry.isFile() && path.endsWith(".ts") && statSync(path).isFile()) files.push(path);
	}
	return files;
}

function details(action: AgentTeamDetails["action"], fields: Partial<AgentTeamDetails>): AgentTeamDetails {
	return { kind: "agent_team", action, ok: true, diagnostics: [], error: undefined, library: undefined, catalog: [], extensionTools: [], run: undefined, cursor: undefined, events: [], steps: [], outputs: [], wait: undefined, message: undefined, cleanup: undefined, notice: undefined, ...fields };
}

function run(fields: Partial<RunSnapshot>): RunSnapshot {
	return { runId: "r1", objective: "detached", status: "running", terminal: false, createdAt: "now", updatedAt: "now", expiresAt: undefined, liveStepIds: [], sinkStepIds: [], lastEvent: undefined, canMessage: true, canCancel: true, canCleanup: false, counts: counts({}), ...fields };
}

function step(fields: Partial<StepSnapshot> & { id: string; agentRef: string; status: StepStatus }): StepSnapshot {
	return { model: undefined, thinking: undefined, effectiveTools: ["read", "grep", "find", "ls"], extensionTools: [], callerSkills: [], needs: [], after: [], startedAt: undefined, endedAt: undefined, lastActivity: undefined, errorMessage: undefined, outputFilePath: undefined, outputChars: undefined, ...fields };
}

function counts(fields: Partial<Record<StepStatus, number>>): Record<StepStatus, number> {
	return { pending: 0, running: 0, succeeded: 0, failed: 0, blocked: 0, timed_out: 0, canceled: 0, ...fields };
}
