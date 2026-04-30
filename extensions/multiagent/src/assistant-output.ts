/** Assistant output storage for agent_team child steps. */

import { accessSync, appendFileSync, constants, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRunResult, StepAssistantOutput } from "./types.ts";
import { INLINE_HANDOFF_CHARS } from "./types.ts";

export function createStepAssistantOutput(): StepAssistantOutput {
	return {
		disposition: "inline",
		chars: 0,
		thresholdChars: INLINE_HANDOFF_CHARS,
		inlineText: "",
		filePath: undefined,
	};
}

export function appendAssistantOutput(result: AgentRunResult, text: string): string | undefined {
	if (text.length === 0) return undefined;
	const output = result.assistantOutput;
	const nextChars = output.chars + text.length;
	if (output.disposition === "inline") {
		const currentText = output.inlineText ?? "";
		if (nextChars <= output.thresholdChars) {
			result.assistantOutput = { ...output, chars: nextChars, inlineText: `${currentText}${text}` };
			return undefined;
		}
		try {
			const filePath = writeAssistantOutputArtifact(result.id, `${currentText}${text}`);
			result.assistantOutput = {
				disposition: "file",
				chars: nextChars,
				thresholdChars: output.thresholdChars,
				inlineText: undefined,
				filePath,
			};
			return undefined;
		} catch (error) {
			return artifactErrorMessage(error);
		}
	}
	if (!output.filePath) return "Subagent assistant output artifact path is missing after file handoff started.";
	try {
		appendFileSync(output.filePath, text, { encoding: "utf8" });
		result.assistantOutput = { ...output, chars: nextChars };
		return undefined;
	} catch (error) {
		return artifactErrorMessage(error);
	}
}

export function setAssistantOutput(result: AgentRunResult, text: string): string | undefined {
	result.assistantOutput = createStepAssistantOutput();
	return appendAssistantOutput(result, text);
}

export function assistantOutputInlineText(result: AgentRunResult): string {
	return result.assistantOutput.disposition === "inline" ? result.assistantOutput.inlineText ?? "" : "";
}

export function assistantOutputArtifactPath(result: AgentRunResult): string | undefined {
	return result.assistantOutput.disposition === "file" ? result.assistantOutput.filePath : undefined;
}

export function assistantOutputIsFile(result: AgentRunResult): boolean {
	return result.assistantOutput.disposition === "file";
}

export function assistantOutputIsReadable(result: AgentRunResult): boolean {
	const path = assistantOutputArtifactPath(result);
	return path !== undefined && isReadableFile(path);
}

export function discardUnreadableAssistantOutputArtifact(result: AgentRunResult): void {
	if (result.assistantOutput.disposition !== "file") return;
	result.assistantOutput = { ...result.assistantOutput, filePath: undefined };
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

function writeAssistantOutputArtifact(stepId: string, text: string): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-multiagent-step-output-"));
	const filePath = join(dir, `${stepId}.md`);
	try {
		writeFileSync(filePath, text, { encoding: "utf8", mode: 0o600 });
	} catch (error) {
		const writeMessage = error instanceof Error ? error.message : String(error);
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch (cleanupError) {
			const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
			throw new Error(`${writeMessage}; additionally failed to remove temp directory: ${cleanupMessage}`);
		}
		throw error;
	}
	return filePath;
}

function artifactErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return `Subagent assistant output artifact persistence failed: ${message}`;
}
