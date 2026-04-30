/** Temp-file persistence for aggregate and per-step model handoff output. */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRunResult, AgentTeamDetails } from "./types.ts";

export async function persistFullStepOutputs(details: AgentTeamDetails): Promise<AgentTeamDetails> {
	const steps: AgentRunResult[] = [];
	for (const step of details.steps) steps.push({ ...step, assistantOutput: { ...step.assistantOutput }, events: step.events.map((event) => ({ ...event })), usage: { ...step.usage } });
	return { ...details, steps };
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
