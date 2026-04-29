import assert from "node:assert/strict";
import test from "node:test";
import { renderAgentTeamCall, renderAgentTeamResult } from "../extensions/multiagent/src/rendering.ts";

const plainTheme = {
	fg(_color: string, text: string) {
		return text;
	},
	bold(text: string) {
		return text;
	},
};

function renderedText(component: { render(width: number): string[] }): string {
	return component.render(240).join("\n");
}

test("renderAgentTeamResult shows validation errors instead of ok run", () => {
	const rendered = renderedText(
		renderAgentTeamResult(
			{
				content: [{ type: "text", text: "# agent_team error\nAction: missing/invalid" }],
				details: {
					kind: "agent_team",
					action: "missing/invalid",
					objective: undefined,
					library: { sources: ["package"], query: undefined, projectAgents: "deny" },
					catalog: [],
					agents: [],
					steps: [],
					diagnostics: [{ code: "action-required", message: "action is required", path: "/action", severity: "error" }],
					fullOutputPath: undefined,
				},
			},
			{ expanded: false, isPartial: false },
			plainTheme,
		),
	);
	assert.equal(rendered.includes("# agent_team error"), true);
	assert.equal(rendered.includes("[ok] agent_team run"), false);
});

test("renderAgentTeamCall shows raw catalog query and objective", () => {
	const catalog = renderedText(
		renderAgentTeamCall(
			{ action: "catalog", library: { query: "OPENAI_API_KEY=sk-query-evidence-abcdefghijklmnopqrstuvwxyz" } },
			plainTheme,
		),
	);
	assert.equal(catalog.includes("sk-query-evidence"), true);

	const run = renderedText(
		renderAgentTeamCall(
			{
				action: "run",
				objective: "Handle OPENAI_API_KEY=sk-objective-evidence-abcdefghijklmnopqrstuvwxyz as raw evidence.",
				agents: [{ id: "worker", kind: "inline", system: "x" }],
				steps: [{ id: "one", agent: "worker", task: "x" }],
			},
			plainTheme,
		),
	);
	assert.equal(run.includes("sk-objective-evidence"), true);
});
