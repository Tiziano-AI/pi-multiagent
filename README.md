# pi-multiagent

`pi-multiagent` is a Pi package for isolated same-session delegation.

It installs:

- `agent_team`, a model-facing tool for running subagents from the current Pi agent.
- `/skill:pi-multiagent`, usage guidance for `agent_team`.
- Reusable package agents such as `package:reviewer` and `package:scout`.

Use it when separate context improves reconnaissance, critique, implementation, review, or synthesis. Do not use it when a direct tool call or one assistant pass is enough.

## Install

From npm:

```bash
pi install npm:pi-multiagent
```

Pinned from GitHub:

```bash
pi install git:github.com/Tiziano-AI/pi-multiagent@v0.1.3
```

From a local checkout:

```bash
pi install /Users/tiziano/Code/pi-multiagent
```

Project-local install:

```bash
cd /path/to/project
pi install /Users/tiziano/Code/pi-multiagent -l
```

One run without installing:

```bash
pi -e /Users/tiziano/Code/pi-multiagent
```

After installing in a running Pi session, use `/reload`.

## Package contents

| Surface | Purpose |
| --- | --- |
| `agent_team` | Model-facing tool for catalog and run calls. |
| `/skill:pi-multiagent` | Usage guidance loaded on demand. |
| `agents/*.md` | Reusable library agents addressed as `package:name`. |
| `README.md` | Operator guide. |
| `ARCH.md` | Runtime contract and trust boundaries. |
| `VISION.md` | Product intent and non-goals. |
| `AGENTS.md` | Repo-local work and release procedure. |

Bundled agents are not Pi skills. They are prompts for `agent_team` library refs.

## Tool shape

`agent_team` has two actions.

`catalog` lists reusable agents:

```json
{
  "action": "catalog",
  "library": {
    "sources": ["package", "user"],
    "query": "review tests"
  }
}
```

`run` executes a bounded graph:

```json
{
  "action": "run",
  "objective": "Review the change before release.",
  "agents": [
    {
      "id": "runtime-reviewer",
      "kind": "inline",
      "system": "Review runtime behavior. Do not edit.",
      "tools": ["read", "grep", "find", "ls"],
      "outputContract": "Findings first. Include paths."
    },
    {
      "id": "test-reviewer",
      "kind": "inline",
      "system": "Review test coverage. Do not edit.",
      "tools": ["read", "grep", "find", "ls"],
      "outputContract": "Findings first. Include missing checks."
    }
  ],
  "steps": [
    {
      "id": "runtime",
      "agent": "runtime-reviewer",
      "task": "Review the implementation boundary."
    },
    {
      "id": "tests",
      "agent": "test-reviewer",
      "task": "Review executable coverage."
    }
  ],
  "synthesis": {
    "task": "Merge verified findings and residual risk.",
    "allowPartial": true
  },
  "limits": {
    "timeoutSecondsPerStep": 600
  }
}
```

A run can use:

- inline agents created for one call
- package, user, or trusted project library agents
- dependency steps with `needs`
- automatic upstream handoff
- optional final synthesis
- concurrency and timeout limits

Public ids for agents and steps use lowercase letters, digits, and hyphens:

```text
^[a-z][a-z0-9-]{0,62}$
```

`agent-team-synthesizer` is reserved for the default synthesis agent.

## Agents

Inline agents are defined inside the `run` call. They default to no tools. Give them only the tools they need.

Library agents are referenced by source-qualified refs:

```text
package:reviewer
user:reviewer
project:reviewer
```

Bare library names are invalid. Use `package:reviewer`, not `reviewer`.

Package agents:

| Ref | Best use | Default tools | Thinking |
| --- | --- | --- | --- |
| `package:scout` | Reconnaissance: files, docs, tests, commands, runtime evidence. | `read`, `grep`, `find`, `ls`, `bash` | `high` |
| `package:planner` | Evidence-backed implementation plan with owners, contracts, failure modes, and validation. | `read`, `grep`, `find`, `ls` | `high` |
| `package:critic` | Pre-implementation stress test for hidden coupling, trust gaps, regressions, data loss, and missing proof. | `read`, `grep`, `find`, `ls` | `high` |
| `package:reviewer` | Pre-release review of code, plans, diffs, tests, boundaries, and validation evidence. | `read`, `grep`, `find`, `ls`, `bash` | `high` |
| `package:worker` | One scoped implementation change with synchronized code, docs, tests, and validation evidence. | `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write` | `high` |
| `package:synthesizer` | Evidence-weighted fan-in that preserves disagreement and residual risk. | `read`, `grep`, `find`, `ls` | `high` |

Catalog output shows each source-qualified ref, declared tools, thinking level, optional model, description, file path, and SHA-256 prefix so the caller can choose and cite the prompt it used.

Library discovery is source-qualified and path-based:

| Source | Search path | Ref form | Default | Trust behavior |
| --- | --- | --- | --- | --- |
| `package` | This package's bundled `agents/*.md` in the installed package or source checkout. | `package:name` | enabled | Package-owned prompts shipped with `pi-multiagent`. |
| `user` | `${PI_CODING_AGENT_DIR}/agents/*.md` when `PI_CODING_AGENT_DIR` is set; otherwise `~/.pi/agent/agents/*.md`. | `user:name` | enabled | Personal prompts. Denied if the directory resolves inside the current project root; symlinked user-agent files are denied. |
| `project` | Nearest ancestor project `.pi/agents/*.md`; the global Pi config root `~/.pi` is not a project marker. | `project:name` | disabled | Repository-controlled prompts. Requires `library.sources` to include `project` and `projectAgents: "confirm"` or `"allow"`. |

`library.sources` selects which sources to discover. If omitted, `agent_team` discovers `package` and `user`. Duplicate names across sources coexist because refs include the source, for example `package:reviewer` and `user:reviewer`. Discovery order is package, user, project; callers should still use the exact source-qualified ref they intend.

Project agents are denied by default because they are repository-controlled prompts. `projectAgents: "confirm"` asks through Pi UI and fails closed without UI; `projectAgents: "allow"` should be used only for trusted repositories.

## Handoff

Upstream step output is appended to dependent tasks as untrusted evidence. It is not an instruction source. If a downstream agent must follow something, put it in that step's `task` or `outputContract`.

There are no caller-selected handoff modes. For each upstream step, `agent_team` automatically:

1. copies the full captured assistant output inline when it is at most 100000 characters;
2. persists larger captured output to a mode `0600` temp file;
3. passes the exact JSON-string file path to the receiver; and
4. launches that receiver with `read` when it needs to dereference oversized upstream artifacts.

The generated task keeps failure reason, cause, and provenance outside the copied or omitted output block.

## Execution boundary

Each child runs as a separate Pi process. The launch includes:

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

The generated agent prompt is appended with `--append-system-prompt`; the delegated task is sent on stdin. The child does not inherit project extensions, context files, skills, prompt templates, themes, or ambient tools.

Tool access is explicit except for automatic oversized-output handoff reads:

- omitted inline `tools`: no tools unless an oversized upstream artifact must be read
- `tools: []`: no tools unless an oversized upstream artifact must be read
- `tools: ["read", "grep"]`: exactly those tools unless an oversized upstream artifact must be read
- library tools: declared by the library prompt unless overridden
- oversized upstream output adds `read` to the receiver launch so the file ref is usable

This package allows `read`, `grep`, `find`, `ls`, `bash`, `edit`, and `write` for child tool allowlists. Add `bash` only when command execution is needed. Bash-enabled children are refused in cwd trees with `.pi/settings.json` because project settings can alter shell behavior.

## Output and failure reporting

`agent_team` returns a model-facing result and structured details.

The result includes:

- catalog entries or run objective
- final synthesis when present
- step status summary
- step output blocks
- diagnostics
- temp-file paths for oversized output when needed

Output is preserved as evidence apart from bounded capture, truncation, and delimiter-safe rendering. `agent_team` does not rewrite subagent text.

Failures keep parent-observed facts separate from child-authored text. Failed and blocked steps include a reason, a first observed cause, and structured provenance. Provenance puts the likely root, first observed cause, closeout, and termination flag first so the calling agent can triage without reading every event.

`agent_team` is not transactional and not crash-resumable. Child edits are real workspace changes. If a run crashes or times out, inspect the workspace before retrying side-effectful work.

## Limits

| Item | Limit |
| --- | --- |
| Invocation agents | 16 |
| Steps | 16 |
| Dependencies per normal step | 12 |
| Synthesis fan-in | 16 |
| Concurrency | 1 to 6; default 6 |
| Per-step timeout | 1 to 3600 seconds; optional; no default |
| Inline upstream handoff | 100000 chars per upstream step |
| Per-step assistant output capture | 200000 chars; larger output fails closed |
| Retained step events | 40 |
| Per-event preview | 2000 chars |
| JSON stdout line buffer | 1000000 chars |

Set `limits.timeoutSecondsPerStep` for broad review, implementation, untrusted work, or tool-using runs.

## Validate the package

```bash
cd /Users/tiziano/Code/pi-multiagent
pnpm run gate
npm pack --dry-run --json
git diff --check
```

`pnpm run gate` runs unit tests, a fake Pi smoke test, package-load checks, package-content checks, and source-size checks.

## Reference

- `ARCH.md` defines the runtime contract.
- `VISION.md` defines product intent and non-goals.
- `AGENTS.md` defines repo-local work rules and release procedure.
- `skills/pi-multiagent/SKILL.md` is the package-owned skill.
