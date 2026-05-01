/** Runtime limit normalization for agent_team runs. */

import type { AgentTeamInput } from "./schemas.ts";
import { DEFAULT_TIMEOUT_SECONDS_PER_STEP, MAX_CONCURRENCY } from "./types.ts";
import type { TeamLimits } from "./types.ts";

/** Apply defaults and defensive bounds for run limits. */
export function normalizeLimits(input: AgentTeamInput): TeamLimits {
	return {
		concurrency: Math.max(1, Math.min(Math.floor(input.limits?.concurrency ?? MAX_CONCURRENCY), MAX_CONCURRENCY)),
		timeoutSecondsPerStep: input.limits?.timeoutSecondsPerStep ?? DEFAULT_TIMEOUT_SECONDS_PER_STEP,
	};
}
