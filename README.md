# pi-multiagent

`pi-multiagent` installs one Pi extension tool, `agent_team`, for delegating from the current parent conversation to isolated child Pi processes in a bounded DAG, with explicit tools, source-qualified agents, automatic evidence handoff, and failure provenance.

Use it when one assistant pass is the wrong shape: broad reconnaissance, competing plans, adversarial critique, scoped implementation, independent review, and synthesis all benefit from separate context and a visible graph.

## What makes it useful

- **Isolated child Pi processes:** each step launches a child Pi process with no child session inheritance and no ambient extensions, context files, skills, prompt templates, or themes.
- **Reviewable DAGs:** steps declare `needs`, concurrency is bounded, and side-effectful work can be serialized instead of hidden in a long prompt.
- **Source-qualified reusable agents:** call `catalog`, then invoke exact refs such as `package:reviewer`, `user:planner`, or trusted `project:auditor`.
- **Explicit tool boundaries:** inline agents default to no tools; library agents use declared tools only unless the caller overrides them.
- **Evidence handoff:** upstream output is automatically attached to downstream tasks as untrusted evidence, not instructions.
- **Failure provenance:** parent-observed process failures, child-authored text, diagnostics, stderr previews, and first observed causes stay distinguishable.
- **Checked-in choreography:** `graphFile` lets a complex run live as a reviewed JSON file instead of an unreadable inline tool argument.

## Install

From npm:

```bash
pi install npm:pi-multiagent
```

From GitHub. Append `@vX.Y.Z` to pin a release tag:

```bash
pi install git:github.com/Tiziano-AI/pi-multiagent
```

From a local checkout:

```bash
pi install /absolute/path/to/pi-multiagent
```

Project-local install:

```bash
cd /path/to/project
pi install /absolute/path/to/pi-multiagent -l
```

One run without installing:

```bash
pi -e /absolute/path/to/pi-multiagent
```

After installing in a running Pi session, use `/reload`.

## Extension and skill

Installing this package gives Pi two related surfaces:

- **Extension tool:** `agent_team`, the tool a parent assistant calls to run isolated child Pi processes.
- **Package skill:** `/skill:pi-multiagent`, the agent-facing operating guide for when and how to catalog agents, design graphs, use `graphFile`, troubleshoot failures, and safely improve this package itself with agent teams.

This README is for humans installing, evaluating, and operating the package. Agents should use the skill for detailed invocation rules and graph-design guidance.

## First success

This ladder keeps human first success small. Agents that need deeper graph-design rules should load `/skill:pi-multiagent`.

1. **Discover package agents.** Catalog output is the authoritative package-agent metadata: refs, tools, thinking level, model, description, path, and SHA prefix.

```json
{
  "action": "catalog",
  "library": {
    "sources": ["package"],
    "query": "review"
  }
}
```

2. **Run a package-backed review.** This proves source-qualified refs and explicit tool narrowing without writing files.

```json
{
  "action": "run",
  "objective": "Review whether the current repository has enough docs for a first-time operator.",
  "library": {
    "sources": ["package"],
    "projectAgents": "deny"
  },
  "agents": [
    {
      "id": "reviewer-readonly",
      "kind": "library",
      "ref": "package:reviewer",
      "tools": ["read", "grep", "find", "ls"],
      "outputContract": "Findings first with severity, evidence path, operator impact, and concrete fix. Do not edit or run commands."
    }
  ],
  "steps": [
    {
      "id": "review-docs",
      "agent": "reviewer-readonly",
      "task": "Review the current repository's README and adjacent docs for first-time operator clarity."
    }
  ],
  "limits": {
    "timeoutSecondsPerStep": 600
  }
}
```

3. **Try dependency handoff and synthesis.** This shows one step feeding evidence to another, then a final decision.

```json
{
  "action": "run",
  "objective": "Review whether the planned change is safe.",
  "library": {
    "sources": ["package"],
    "projectAgents": "deny"
  },
  "agents": [
    {
      "id": "mapper",
      "kind": "inline",
      "system": "Map the relevant files and contracts. Do not edit.",
      "tools": ["read", "grep", "find", "ls"],
      "outputContract": "Evidence map with paths, facts, unknowns, and likely owners."
    },
    {
      "id": "reviewer",
      "kind": "inline",
      "system": "Review the evidence for risks. Do not edit.",
      "tools": ["read", "grep", "find", "ls"],
      "outputContract": "Findings first with severity, evidence path, impact, and concrete fix."
    }
  ],
  "steps": [
    {
      "id": "map",
      "agent": "mapper",
      "task": "Map the affected surface."
    },
    {
      "id": "review",
      "agent": "reviewer",
      "needs": ["map"],
      "task": "Use the upstream evidence to review risk."
    }
  ],
  "synthesis": {
    "task": "Return accept, repair, block, or defer. Preserve uncertainty and missing proof.",
    "allowPartial": true
  },
  "limits": {
    "timeoutSecondsPerStep": 600
  }
}
```

4. **Move reusable choreography into a file.** Copy and adapt a cookbook JSON file into the current workspace, then run it with `graphFile`. `graphFile` loads a complete static run graph from cwd; it is not a runtime template API or parameterization system.

```json
{
  "action": "run",
  "graphFile": "read-only-audit-fanout.json"
}
```

Packaged examples are references to copy and adapt; `graphFile` does not load package examples by name. It is mutually exclusive with inline run fields and must be a relative `.json` path to a regular file inside the current working directory; nested `graphFile` wrappers and symlinks are denied.

## Reading results

- Catalog output shows active sources and source-qualified refs. Treat it as authoritative for package-agent metadata.
- Run output starts with the objective and final synthesis when present, then step summary, step outputs, and diagnostics.
- Failed, blocked, timed-out, or aborted steps include status, `failureCause`, and failure provenance. Child-authored explanations do not override parent-observed process facts.
- Large upstream outputs may appear as mode `0600` file refs; receivers get `read` only when that artifact handoff needs it.

## Use when

- Separate context improves reconnaissance, critique, implementation, review, or synthesis.
- You need package, user, or explicitly trusted project agents by source-qualified ref.
- The work benefits from dependency steps, bounded concurrency, serialized side effects, final fan-in, or partial-failure triage.
- You want large upstream output and failure facts passed forward without inventing your own handoff protocol.
- A complex graph should be checked into the repo and reviewed before it runs.

## Do not use when

- A direct tool call or one assistant pass is enough.
- Write-capable agents would touch overlapping files without serialization or explicit ownership.
- The user wants a human slash-command workflow rather than model-facing delegation.
- The plan depends on filtering, laundering, or trusting subagent text instead of controlling sources, tools, and launch boundaries.
- Required approval is missing for destructive, externally visible, privacy-sensitive, or materially choice-dependent work.

## Mental model

```text
parent Pi conversation
  -> agent_team tool call
  -> bounded DAG of isolated child Pi processes
  -> upstream evidence handoff
  -> optional synthesis
  -> parent decides the next action
```

The parent stays in the current conversation. Children are separate Pi processes launched with `--no-session`; they do not inherit the parent session, context files, skills, extensions, prompt templates, themes, or ambient tools. If a child needs repo-specific instructions, put them in that step's task or output contract.

## Agents and catalog provenance

Inline agents are defined inside one `run` call. They default to no tools unless an oversized upstream artifact needs `read` for handoff.

Library agents are source-qualified:

```text
package:reviewer
user:reviewer
project:reviewer
```

Bare library names are invalid. Use `package:reviewer`, not `reviewer`.

Library discovery is explicit:

| Source | Search path | Ref form | Default | Trust behavior |
| --- | --- | --- | --- | --- |
| `package` | Bundled `agents/*.md` in this package. | `package:name` | enabled | Package-owned prompts shipped with `pi-multiagent`. |
| `user` | `${PI_CODING_AGENT_DIR}/agents/*.md`, or `~/.pi/agent/agents/*.md` when unset. | `user:name` | enabled | Personal prompts. Denied when the directory resolves inside the current project root; symlinked user-agent files are denied. |
| `project` | Nearest ancestor project `.pi/agents/*.md`; global `~/.pi` is not a project marker. | `project:name` | disabled | Repository-controlled prompts. Requires `library.sources` plus `projectAgents: "confirm"` or `"allow"`. |

`library.query` is a case-insensitive substring filter over catalog metadata, not full prompt bodies. Role names or refs are the safest queries. Duplicate names across sources coexist because the source is part of the ref.

For package-agent role-selection heuristics, graph design, and package self-improvement workflows, have the agent load `/skill:pi-multiagent` after checking the runtime catalog.

## Trust boundary

Each child launch includes:

```text
--mode json
-p
--no-session
--no-extensions
--no-context-files
--no-skills
--no-prompt-templates
--no-themes
--system-prompt ""
```

The generated agent prompt is appended with `--append-system-prompt`; the delegated task is sent on stdin.

Tool access is an allowlist:

- omitted inline `tools`: no tools unless oversized-output handoff must add `read`
- `tools: []`: no tools unless oversized-output handoff must add `read`
- `tools: ["read", "grep"]`: exactly those tools unless oversized-output handoff must add `read`
- library tools: declared by the library prompt unless overridden

This package currently allows `read`, `grep`, `find`, `ls`, `bash`, `edit`, and `write` for child tool allowlists. Add `bash` only when command execution is needed and trusted. Bash-enabled children are refused in cwd trees with `.pi/settings.json` because project settings can alter shell behavior.

Child Pi processes inherit the parent OS process environment needed to run Pi and provider clients. `agent_team` does not scrub environment variables or credentials. Do not grant `bash` to untrusted children.

`agent_team` is not an OS sandbox, not a same-UID filesystem isolation boundary, and not a secret filter. Mode `0600` temp artifacts protect against other OS users, not against children that were explicitly given filesystem-capable tools.

## Graph cookbook

The cookbook contains schema-checked starting graphs. They are documentation artifacts, not a runtime template API. Copy a JSON file, run catalog to verify refs in the current environment, replace the objective, tasks, and output contracts, then run the edited graph inline or through `graphFile`.

Everyday examples:

- [`examples/graphs/read-only-audit-fanout.json`](examples/graphs/read-only-audit-fanout.json): read-only mapping plus contract, docs, and risk review lanes.
- [`examples/graphs/docs-examples-alignment.json`](examples/graphs/docs-examples-alignment.json): checks that human README copy, agent skill guidance, cookbook guidance, examples, and tests stay aligned.
- [`examples/graphs/implementation-review-gate.json`](examples/graphs/implementation-review-gate.json): maps a scoped change, plans it, stress-tests it, runs one serialized authorized worker, then reviews validation.

Advanced examples:

- [`examples/graphs/research-to-change-gated-loop.json`](examples/graphs/research-to-change-gated-loop.json): ambiguous product/runtime changes with discovery, competing plans, validation contract, serialized workers, reviews, and final triage.
- [`examples/graphs/public-release-foundry.json`](examples/graphs/public-release-foundry.json): package, extension, CLI, skill, or public artifact release readiness with independent audits and human-owned publish/push/tag stop points.

For graph selection, adaptation rules, and safety gates, have the agent load `/skill:pi-multiagent` and its graph cookbook reference.

## Handoff, output, and failures

Upstream step output is appended to dependent tasks as untrusted evidence, not instructions. If a downstream agent must obey something, put it in that downstream step's `task` or `outputContract`.

There are no caller-selected handoff modes. For each upstream step, `agent_team` automatically:

1. copies assistant output inline when it is at most 100000 characters;
2. persists larger assistant output to a mode `0600` temp file;
3. passes the exact JSON-string file path to the receiver; and
4. launches that receiver with `read` when it needs to dereference oversized upstream artifacts.

The generated handoff keeps failure reason, first observed cause, and provenance outside the copied child-output block.

Failures keep parent-observed facts separate from child-authored text. Failed and blocked steps include the terminal reason, first observed cause, and structured failure provenance. Retryable child Pi provider errors can auto-retry inside the child process; retry lifecycle events remain diagnostics.

`agent_team` is not transactional and not crash-resumable. Child edits are real workspace changes. If a run crashes, times out, or is aborted, inspect the workspace before retrying side-effectful work.

## Troubleshooting quick checks

| Symptom | Check |
| --- | --- |
| Catalog has no expected role | Confirm `library.sources`, query spelling, and whether the role is package, user, or trusted project. |
| Bare ref is rejected | Use a source-qualified ref such as `package:reviewer`; bare library names are invalid. |
| Project agents do not load | `projectAgents` defaults to `deny`; `confirm` fails closed without UI; use `allow` only for trusted repositories. |
| `graphFile` is rejected | Use a relative `.json` regular file inside cwd; do not pass inline run fields with `graphFile`. |
| Bash child is refused | The step cwd is inside a tree with `.pi/settings.json`; remove `bash`, change cwd, or run outside that project-settings tree. |
| Downstream step is blocked | Inspect failed dependency status, `failureCause`, and failure provenance before retrying. |
| Run appears stuck | Set `limits.timeoutSecondsPerStep` for broad, untrusted, implementation, bash-using, or tool-using graphs. |

## Limits

| Item | Limit |
| --- | --- |
| Invocation agents | 16 |
| Steps | 16 |
| Dependencies per normal step | 12 |
| Synthesis fan-in | 16 |
| Concurrency | 1 to 6; default 6 |
| Per-step timeout | 1 to 3600 seconds; optional; no default |
| Inline upstream handoff | 100000 chars per upstream step; larger output uses a mode `0600` file artifact |
| Model-facing aggregate output | 2000 lines or 50KB; the full aggregate is written to a temp file when possible |
| Graph file input | Relative `.json` file inside cwd; 256 KiB max |
| Retained step events | 40 |
| Per-event preview | 2000 chars |
| JSON stdout line buffer | 1000000 chars |

Set `limits.timeoutSecondsPerStep` for broad review, implementation, untrusted work, bash-using work, or other tool-using runs.

## Package contents

| Surface | Purpose |
| --- | --- |
| `agent_team` | Model-facing tool registered by the Pi extension. |
| `/skill:pi-multiagent` | Agent-facing guidance for using, reviewing, troubleshooting, and improving `agent_team` and this package with bounded teams. |
| `agents/*.md` | Reusable library prompts addressed as `package:name`. |
| `examples/graphs/*.json` | Schema-checked cookbook examples. |
| `assets/pi-multiagent-gallery.webp` | Pi package-gallery preview image referenced by `package.json` `pi.image`. |
| `README.md` | Front-facing operator and evaluator guide. |
| `ARCH.md` | Normative runtime contract, trust boundary, lifecycle, and provenance owner. |
| `VISION.md` | Product purpose, principles, success criteria, and non-goals. |
| `AGENTS.md` | Repo-local work, validation, and release procedure. |

Bundled agents are not Pi skills. They are prompts for `agent_team` library refs.

## Validate the package

```bash
cd /path/to/pi-multiagent
pnpm run gate
npm pack --dry-run --json
git diff --check
```

`pnpm run gate` runs unit tests, graph-cookbook example validation, fake Pi smoke, package-load checks, package-content checks, public-doc portability checks, and source-size checks.

## Reference

- [`ARCH.md`](ARCH.md) defines the runtime contract.
- [`VISION.md`](VISION.md) defines product intent and non-goals.
- [`AGENTS.md`](AGENTS.md) defines repo-local work rules and release procedure.
- [`skills/pi-multiagent/SKILL.md`](skills/pi-multiagent/SKILL.md) is the package-owned skill.
- [`skills/pi-multiagent/references/graph-cookbook.md`](skills/pi-multiagent/references/graph-cookbook.md) explains reusable graph choreography.
- [`examples/graphs`](examples/graphs) contains schema-checked graph-cookbook examples.
