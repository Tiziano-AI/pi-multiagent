/** Structured failure-provenance display helpers. */

import type { FailureProvenance } from "./types.ts";

export function formatFailureProvenance(provenance: FailureProvenance): string {
	const exitCode = provenance.exitCode === undefined ? "none" : String(provenance.exitCode);
	const exitSignal = provenance.exitSignal ?? "none";
	const stopReason = provenance.stopReason ?? "none";
	return `likely_root=${JSON.stringify(provenance.likelyRoot)}; first_observed=${JSON.stringify(provenance.firstObserved)}; closeout=${provenance.closeout}; failure_terminated=${provenance.failureTerminated}; status=${provenance.status}; exit_code=${exitCode}; exit_signal=${exitSignal}; timed_out=${provenance.timedOut}; aborted=${provenance.aborted}; stop_reason=${JSON.stringify(stopReason)}; malformed_stdout=${provenance.malformedStdout}; saw_assistant_message_end=${provenance.sawAssistantMessageEnd}; protocol_terminal=${provenance.protocolTerminal}; late_events_ignored=${provenance.lateEventsIgnored}`;
}
