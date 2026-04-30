# pi-multiagent vision

## Product

`pi-multiagent` is a Pi package for bounded multi-agent delegation from the current parent conversation.

It gives the parent Pi agent one tool, `agent_team`, for launching isolated child Pi processes, passing evidence through a dependency graph, and synthesizing results without pretending that subagent text is trusted instruction.

## Problem

Pi keeps the core agent loop small. Some work still needs more than one context: reconnaissance, competing plans, adversarial critique, implementation, validation review, release proof, and final synthesis.

Without a package boundary, callers copy prompts manually, tool access is ambiguous, child context is hard to reason about, and useful evidence becomes a pile of unstructured transcript text.

## Principles

- One public tool: `agent_team`.
- One package-owned skill: `pi-multiagent`.
- Inline agents are first-class and default to no tools.
- Reusable agents use source-qualified refs: `package:name`, `user:name`, or `project:name`.
- Project agents are denied by default.
- Child processes do not inherit parent sessions, project Pi resources, or ambient tools.
- Child tools are allowlisted, and side-effectful work is serialized unless ownership is disjoint.
- Upstream output is evidence, not instructions.
- Output is preserved as evidence, inline up to 100000 characters and then by artifact reference.
- Failure provenance should make the first observed cause and parent closeout visible before child-authored explanations.
- Cookbook graphs are copyable examples, not a second runtime template API.

## Success criteria

- The calling agent can discover reusable agents and cite their provenance from the authoritative runtime catalog.
- The calling agent can run inline and library-backed agents in a bounded DAG with explicit dependencies and limits.
- Downstream agents receive evidence with clear trust framing and automatic large-output handoff.
- Failed, blocked, timed-out, or aborted steps expose reason, cause, provenance, and usable partial evidence where available.
- The package skill teaches safe invocation without replacing README or ARCH.
- The graph cookbook makes advanced choreography discoverable without expanding runtime surface area.
- Package checks verify schema behavior, launch boundaries, rendering, provenance, skills, graph examples, public copy, source size, and packed artifacts.

## Non-goals

- No OS sandbox or secret-filtering guarantee.
- No hidden child inheritance of sessions, extensions, context files, skills, prompt templates, themes, or project system prompts.
- No autonomous swarm behavior outside the parent tool call.
- No daemon, external scheduler, durable run ledger, transactionality, or crash resume.
- No human slash-command workflow.
- No runtime graph-template action; cookbook graphs are copyable examples.
- No old-schema fallback, alternate bare library refs, or output-laundering layer over subagent text.
- No release, publish, push, or deploy automation.
- No Pi vendor-code changes.
