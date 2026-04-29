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
pi install git:github.com/Tiziano-AI/pi-multiagent@v0.1.1
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
- bounded upstream handoff
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

| Ref | Use |
| --- | --- |
| `package:scout` | Fast evidence gathering. |
| `package:planner` | Plans from evidence. |
| `package:critic` | Pre-mortem review. |
| `package:reviewer` | Final code or plan review. |
| `package:worker` | Scoped implementation. |
| `package:synthesizer` | Fan-in and decision synthesis. |

Human-authored library agents live in:

- package: `agents/*.md`
- user: `~/.pi/agent/agents/*.md`
- project: nearest `.pi/agents/*.md`

Project agents are denied by default because they are repository-controlled prompts. Use `projectAgents: "confirm"` or `"allow"` only for trusted repositories.

## Handoff

Upstream step output is appended to dependent tasks as untrusted evidence. It is not an instruction source. If a downstream agent must follow something, put it in that step's `task` or `outputContract`.

Handoff modes:

| Mode | Behavior |
| --- | --- |
| `preview` | Default. Copies a bounded output preview. |
| `full` | Copies bounded full output up to `maxChars`. |
| `file-ref` | Sends file metadata instead of copied output. The receiver must have the exact `read` tool. |

The default no-tool synthesis agent cannot use `file-ref` because it cannot read files.

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

Tool access is explicit:

- omitted inline `tools`: no tools
- `tools: []`: no tools
- `tools: ["read", "grep"]`: exactly those tools
- library tools: declared by the library prompt unless overridden

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
| Upstream preview | default 6000 chars; max 50000 |
| Per-step assistant output capture | 200000 chars |
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
