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

## First success

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

2. **Run a tiny DAG.** This keeps the first call small while showing dependency handoff and synthesis.

```json
{
  "action": "run",
  "objective": "Review whether the planned change is safe.",
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

3. **Move complex choreography into a file.** `graphFile` loads a complete static run graph; it is not a runtime template API or parameterization system.

```json
{
  "action": "run",
  "graphFile": "examples/graphs/research-to-change-gated-loop.json"
}
```

`graphFile` is mutually exclusive with inline run fields. It must be a relative `.json` path to a regular file inside the current working directory; nested `graphFile` wrappers and symlinks are denied.

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

Package-agent role heuristics after checking the runtime catalog:

- `package:scout`: reconnaissance across files, docs, tests, commands, and runtime evidence.
- `package:planner`: evidence-backed implementation plans with owners, contracts, failure modes, and validation.
- `package:critic`: stress tests for hidden coupling, trust gaps, regressions, data loss, and missing proof.
- `package:reviewer`: review of code, plans, diffs, tests, boundaries, and validation evidence.
- `package:worker`: one scoped implementation change with synchronized code, docs, tests, and validation evidence.
- `package:synthesizer`: evidence-weighted fan-in that preserves disagreement and residual risk.

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

`agent_team` is not an OS sandbox, not a same-UID filesystem isolation boundary, and not a secret filter. Mode `0600` temp artifacts protect against other OS users, not against children that were explicitly given filesystem-capable tools.

## Graph cookbook

The cookbook contains schema-checked starting graphs. They are documentation artifacts, not a runtime template API. Copy a JSON file, run catalog to verify refs in the current environment, replace the objective, tasks, and output contracts, then run the edited graph inline or through `graphFile`.

### Change Safety Flight Recorder / Research-to-Change Gated Loop

Example: [`examples/graphs/research-to-change-gated-loop.json`](examples/graphs/research-to-change-gated-loop.json)

Use when the request is ambiguous and the safe path is not known. It stages broad and focused discovery, competing minimal/structural/no-change plans, a validation contract, implementation-contract synthesis, premortem, serialized authorized workers, post-change proof/review fan-out, and final decision synthesis.

```text
broad-discovery
  -> focused-discovery
  -> minimal-plan + structural-plan + no-change-case + validation-contract
  -> implementation-contract
  -> premortem
  -> core-worker
  -> tests-docs-worker
  -> runtime-review + validation-review + risk-review
  -> final synthesis allowPartial:true
```

It demonstrates least-privilege library bindings for read-only scout/reviewer lanes, a bounded bash proof lane, worker hard stops, explicit validation obligations, and final partial synthesis that reports failed or blocked lanes without treating them as success.

### Public Release Foundry

Example: [`examples/graphs/public-release-foundry.json`](examples/graphs/public-release-foundry.json)

Use when a package, extension, CLI, or public artifact needs release-quality proof. It maps release surfaces, runs independent contract/trust/QA/docs/ops audits, plans release readiness, stress-tests the plan, serializes authorized updates, reviews the final candidate, and synthesizes ship/block/needs-work/defer.

```text
release-map
  -> contract-audit + trust-audit + qa-audit + docs-audit + ops-audit
  -> release-plan
  -> premortem
  -> docs-worker
  -> package-worker
  -> release-review
  -> final synthesis
```

It keeps publication, pushing, tagging, and destructive release actions behind explicit human approval while preserving proof gaps and minority risks.

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
| `/skill:pi-multiagent` | Progressive-disclosure guidance for using, reviewing, or changing `agent_team`. |
| `agents/*.md` | Reusable library prompts addressed as `package:name`. |
| `examples/graphs/*.json` | Schema-checked cookbook examples. |
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
