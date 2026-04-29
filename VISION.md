# pi-multiagent vision

## Product promise

`pi-multiagent` gives a calling Pi agent one model-native tool, `agent_team`, for isolated delegation inside the same Pi session.

A caller can define temporary specialists, use reusable package/user/project agent prompts when trusted, run a dependency graph, and synthesize results without leaving the current conversation.

## User problem

Pi intentionally stays minimal. Complex coding work sometimes benefits from parallel reconnaissance, critique, implementation, or review, but ad hoc subagent orchestration is easy to make unsafe, noisy, or hard for the calling model to consume.

`pi-multiagent` supplies the missing orchestration layer as a package, not a Pi core fork.

## Principles

- One public tool: `agent_team`.
- The primary customer is the calling model, not a human workflow UI.
- Same-session evidence is preserved raw apart from bounded capture, truncation, and delimiter-safe rendering.
- Safety comes from capability, source, and launch boundaries, not arbitrary output laundering.
- Reusable agents are source-qualified as `package:name`, `user:name`, or `project:name`.
- Inline agents remain first-class and do not require a prebuilt roster.
- Project-controlled prompts are denied by default and must be explicitly trusted.
- Child Pi processes launch with isolated resource loading and explicit tool allowlists.
- Broad, untrusted, tool-using, or side-effectful runs should set explicit timeouts and serialize writes unless ownership is disjoint.

## Success criteria

- A caller can discover reusable agents and distinguish package/user/project provenance.
- A caller can run inline or library-backed agents with bounded concurrency and dependency edges.
- Downstream agents receive upstream evidence as untrusted evidence, not instructions.
- File-reference handoff is explicit and requires the exact `read` tool.
- Failure provenance separates first observed cause, parent closeout, raw stderr, and model-facing triage fields.
- Package tests and pack checks prove the public schema, launch boundary, rendering, provenance, and package artifact.

## Non-goals

- No daemon, external scheduler, durable run ledger, or crash-resume implementation.
- No human slash-command workflow clone.
- No hidden old-schema fallbacks or alternate names for old schemas or bare library names.
- No output-laundering or credential-filtering layer over subagent output.
- No Pi vendor-code patches.
