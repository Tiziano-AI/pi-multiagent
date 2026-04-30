# pi-multiagent vision

## Product

`pi-multiagent` is a Pi package for isolated same-session delegation.

It gives the current Pi agent one tool, `agent_team`, for running subagents, collecting evidence, and synthesizing results without leaving the current conversation.

## Problem

Pi keeps its core small. Some tasks still benefit from separate contexts: reconnaissance, critique, test review, and final synthesis.

Without a package boundary, callers copy prompts manually, trust boundaries become unclear, and outputs are harder for the calling agent to use.

## Principles

- One public tool: `agent_team`.
- One package-owned skill: `pi-multiagent`.
- Inline agents are first-class.
- Reusable agents use source-qualified refs: `package:name`, `user:name`, or `project:name`.
- Project agents are denied by default.
- Child processes do not inherit project Pi resources or ambient tools.
- Upstream output is evidence, not instructions.
- Safety is enforced through source, launch, and tool boundaries.
- Output is preserved as evidence, inline up to 100000 characters and then by artifact reference.
- Side-effectful work is serialized unless ownership is disjoint.

## Success criteria

- The calling agent can discover reusable agents and see their provenance.
- The calling agent can run inline and library-backed agents in a bounded dependency graph.
- Downstream agents receive evidence with clear trust framing.
- Oversized upstream output is automatically passed by artifact reference and the receiver is launched with `read`.
- Failure output separates first observed cause, parent closeout, stderr, and triage fields.
- The package skill guides safe graph construction without replacing the docs.
- Package checks verify the schema, launch boundary, rendering, provenance, skill, and packed artifact.

## Non-goals

- No daemon.
- No external scheduler.
- No durable run ledger or crash resume.
- No human slash-command workflow.
- No old-schema fallback or alternate names for bare library refs.
- No output-laundering layer over subagent text.
- No Pi vendor-code changes.
