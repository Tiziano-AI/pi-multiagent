/** Detached graph limit normalization. */

import type { GraphSpec } from "./schemas.ts";
import type { StartOptions, TeamLimits } from "./types.ts";
import { DEFAULT_CONCURRENCY, DEFAULT_MAX_RUN_SECONDS, DEFAULT_NOTIFY_MAX_NOTICES, DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS, DEFAULT_NOTIFY_MODE, DEFAULT_TERMINAL_RETENTION_SECONDS, DEFAULT_TIMEOUT_SECONDS_PER_STEP, MAX_CONCURRENCY, MAX_MAX_RUN_SECONDS, MAX_NOTIFY_MAX_NOTICES, MAX_NOTIFY_MIN_INTERVAL_SECONDS, MAX_TERMINAL_RETENTION_SECONDS, MAX_TIMEOUT_SECONDS_PER_STEP } from "./types.ts";

export function normalizeLimits(graph: GraphSpec): TeamLimits {
	return {
		concurrency: clampInteger(graph.limits?.concurrency ?? DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY),
		timeoutSecondsPerStep: clampInteger(graph.limits?.timeoutSecondsPerStep ?? DEFAULT_TIMEOUT_SECONDS_PER_STEP, 1, MAX_TIMEOUT_SECONDS_PER_STEP),
	};
}

export function normalizeStartOptions(input: { maxRunSeconds?: number; terminalRetentionSeconds?: number; notify?: { mode?: StartOptions["notify"]["mode"]; maxNotices?: number; minIntervalSeconds?: number } } | undefined): StartOptions {
	return {
		maxRunSeconds: clampInteger(input?.maxRunSeconds ?? DEFAULT_MAX_RUN_SECONDS, 1, MAX_MAX_RUN_SECONDS),
		terminalRetentionSeconds: clampInteger(input?.terminalRetentionSeconds ?? DEFAULT_TERMINAL_RETENTION_SECONDS, 1, MAX_TERMINAL_RETENTION_SECONDS),
		notify: {
			mode: input?.notify?.mode ?? DEFAULT_NOTIFY_MODE,
			maxNotices: clampInteger(input?.notify?.maxNotices ?? DEFAULT_NOTIFY_MAX_NOTICES, 0, MAX_NOTIFY_MAX_NOTICES),
			minIntervalSeconds: clampInteger(input?.notify?.minIntervalSeconds ?? DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS, 0, MAX_NOTIFY_MIN_INTERVAL_SECONDS),
		},
	};
}

function clampInteger(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, Math.floor(value)));
}
