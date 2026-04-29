/** Temp-file persistence for aggregate and per-step model handoff output. */

import { accessSync, constants, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDiagnostic } from "./json-events.ts";
import type { AgentRunResult, AgentTeamDetails } from "./types.ts";

export async function persistFullStepOutputs(details: AgentTeamDetails): Promise<AgentTeamDetails> {
	const steps: AgentRunResult[] = [];
	for (const step of details.steps) {
		const persisted = { ...step, events: step.events.map((event) => ({ ...event })), usage: { ...step.usage } };
		await persistFullStepOutput(persisted);
		steps.push(persisted);
	}
	return { ...details, steps };
}

export async function persistFullStepOutput(result: AgentRunResult): Promise<void> {
	if (result.outputFull.length === 0) return;
	if (result.fullOutputPath && isReadableFile(result.fullOutputPath)) return;
	if (result.fullOutputPath) {
		appendDiagnostic(result, `Discarded stale fullOutputPath for ${result.id} because the artifact could not be read.`);
		result.fullOutputPath = undefined;
	}
	try {
		result.fullOutputPath = await writeTempMarkdown("pi-multiagent-step-output-", `${result.id}.md`, result.outputFull);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		appendDiagnostic(result, `Could not persist full step output: ${message}`);
	}
}

export async function writeTempMarkdown(prefix: string, fileName: string, text: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	const filePath = join(dir, fileName);
	try {
		await writeFile(filePath, text, { encoding: "utf8", mode: 0o600 });
	} catch (error) {
		const writeMessage = error instanceof Error ? error.message : String(error);
		try {
			await rm(dir, { recursive: true, force: true });
		} catch (cleanupError) {
			const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
			throw new Error(`${writeMessage}; additionally failed to remove temp directory: ${cleanupMessage}`);
		}
		throw error;
	}
	return filePath;
}

export function isReadableFile(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}
