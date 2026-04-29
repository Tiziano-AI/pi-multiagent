/** Compact TUI rendering for the model-native `agent_team` tool. */

import type { AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import type { AgentTeamInput } from "./schemas.ts";
import type { AgentRunResult, AgentTeamDetails } from "./types.ts";
import { isAgentTeamDetails } from "./types.ts";
import { aggregateUsage, fallbackResultText, formatUsageStats } from "./result-format.ts";

interface RenderOptions {
	expanded: boolean;
	isPartial: boolean;
}

export function renderAgentTeamCall(args: AgentTeamInput, theme: Theme) {
	if (args.action === "catalog") {
		const query = args.library?.query ? ` ${theme.fg("dim", args.library.query)}` : "";
		return new Text(`${theme.fg("toolTitle", theme.bold("agent_team"))} ${theme.fg("accent", "catalog")}${query}`, 0, 0);
	}
	const agents = args.agents?.length ?? 0;
	const steps = args.steps?.length ?? 0;
	const synthesis = args.synthesis ? " + synthesis" : "";
	return new Text(
		`${theme.fg("toolTitle", theme.bold("agent_team"))} ${theme.fg("accent", `run ${steps} step(s)`)}${theme.fg(
			"muted",
			` ${agents} explicit agent(s)${synthesis}`,
		)}\n  ${theme.fg("dim", shorten(args.objective ?? "objective missing", 120))}`,
		0,
		0,
	);
}

export function renderAgentTeamResult(result: AgentToolResult<AgentTeamDetails>, options: RenderOptions, theme: Theme) {
	const details = isAgentTeamDetails(result.details) ? result.details : undefined;
	if (!details) return new Text(primaryText(result), 0, 0);
	if (isValidationError(details)) return new Text(primaryText(result), 0, 0);
	if (details.action === "catalog") return renderCatalog(details, theme);
	if (options.expanded) return renderExpandedRun(details, theme);
	return new Text(renderCollapsedRun(details, options.isPartial, theme), 0, 0);
}

function isValidationError(details: AgentTeamDetails): boolean {
	return details.diagnostics.some((item) => item.severity === "error") && details.steps.length === 0 && details.catalog.length === 0;
}

function renderCatalog(details: AgentTeamDetails, theme: Theme) {
	const rows = details.catalog.map((agent) => `${theme.fg("accent", agent.ref)} ${theme.fg("muted", `sha256:${agent.sha256.slice(0, 12)}`)} ${agent.description}`);
	return new Text(
		[
			`${theme.fg("toolTitle", theme.bold("agent_team catalog"))} ${theme.fg("accent", `${details.catalog.length} agent(s)`)}`,
			`Sources: ${details.library.sources.join(", ")}`,
			...rows.slice(0, 12),
			details.catalog.length > 12 ? theme.fg("muted", `+${details.catalog.length - 12} more`) : "",
		]
			.filter((line) => line.length > 0)
			.join("\n"),
		0,
		0,
	);
}

function renderCollapsedRun(details: AgentTeamDetails, isPartial: boolean, theme: Theme): string {
	const running = details.steps.filter((step) => step.status === "running").length;
	const terminal = details.steps.filter((step) => step.status !== "pending" && step.status !== "running").length;
	const failures = details.steps.filter((step) => ["failed", "aborted", "timed_out", "blocked"].includes(step.status)).length;
	const status = isPartial || running > 0 ? theme.fg("warning", "[running]") : failures > 0 ? theme.fg("warning", "[mixed]") : theme.fg("success", "[ok]");
	const lines = [`${status} ${theme.fg("toolTitle", theme.bold("agent_team run"))} ${theme.fg("accent", `${terminal}/${details.steps.length} terminal`)}`];
	for (const step of details.steps) lines.push(renderStepCollapsed(step, theme));
	const usage = formatUsageStats(aggregateUsage(details.steps), undefined);
	if (usage.length > 0) lines.push(theme.fg("dim", `Total: ${usage}`));
	return lines.join("\n\n");
}

function renderExpandedRun(details: AgentTeamDetails, theme: Theme) {
	const container = new Container();
	container.addChild(new Text(`${theme.fg("toolTitle", theme.bold("agent_team run"))}\n${theme.fg("dim", details.objective ?? "")}`, 0, 0));
	const mdTheme = getMarkdownTheme();
	for (const step of details.steps) {
		container.addChild(new Spacer(1));
		container.addChild(new Text(`${statusLabel(step, theme)} ${theme.fg("accent", step.id)} ${theme.fg("muted", `agent=${step.agentRef}`)}`, 0, 0));
		if (step.needs.length > 0) container.addChild(new Text(theme.fg("dim", `needs: ${step.needs.join(", ")}`), 0, 0));
		if (step.events.length > 0) {
			for (const event of step.events) container.addChild(new Text(renderEventLine(event.label, event.preview, event.status, theme), 0, 0));
		}
		const output = fallbackResultText(step).trim();
		if (output.length > 0) container.addChild(new Markdown(output, 0, 0, mdTheme));
		if ((step.outputTruncated || step.outputCaptureTruncated) && step.fullOutputPath) container.addChild(new Text(theme.fg("dim", `full output: ${step.fullOutputPath}`), 0, 0));
		if (step.stderr.trim().length > 0) container.addChild(new Text(theme.fg("warning", step.stderr.trim()), 0, 0));
		const usage = formatUsageStats(step.usage, step.model);
		if (usage.length > 0) container.addChild(new Text(theme.fg("dim", usage), 0, 0));
	}
	return container;
}

function renderStepCollapsed(step: AgentRunResult, theme: Theme): string {
	const activity = step.events.slice(-3).map((event) => renderEventLine(event.label, event.preview, event.status, theme));
	const output = step.output.trim();
	if (output.length > 0) activity.push(theme.fg("toolOutput", shorten(output.replace(/\s+/g, " "), 180)));
	return [
		`${statusLabel(step, theme)} ${theme.fg("accent", step.id)} ${theme.fg("muted", `agent=${step.agentRef}`)}`,
		activity.length > 0 ? activity.join("\n") : theme.fg("muted", step.status === "pending" ? "pending" : "no output"),
	].join("\n");
}

function renderEventLine(label: string, preview: string, status: string | undefined, theme: Theme): string {
	const marker = status === "error" ? theme.fg("error", "x") : status === "done" ? theme.fg("success", "+") : theme.fg("muted", "> ");
	const suffix = preview.length > 0 ? ` ${theme.fg("dim", shorten(preview, 120))}` : "";
	return `${marker}${theme.fg("muted", label)}${suffix}`;
}

function statusLabel(step: AgentRunResult, theme: Theme): string {
	switch (step.status) {
		case "succeeded":
			return theme.fg("success", "[ok]");
		case "failed":
			return theme.fg("error", "[fail]");
		case "aborted":
			return theme.fg("warning", "[abort]");
		case "timed_out":
			return theme.fg("warning", "[timeout]");
		case "blocked":
			return theme.fg("warning", "[blocked]");
		case "pending":
			return theme.fg("muted", "[pending]");
		case "running":
			return theme.fg("warning", "[run]");
	}
}

function primaryText(result: AgentToolResult<AgentTeamDetails>): string {
	for (const item of result.content) {
		if (item.type === "text") return item.text;
	}
	return "(no output)";
}

function shorten(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}
