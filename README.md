# pi-multiagent

`pi-multiagent` installs one Pi extension tool, `agent_team`, plus the `/skill:pi-multiagent` model-facing guide and schema-checked graph examples. Use it when independent helper context is worth the overhead: local reconnaissance, critique, validation proof, current web research with explicit grants, or fan-in synthesis.

The parent assistant stays in charge. Child output is evidence, not instructions.

This README is the **human/operator path**: what gets installed, first run, safe supervision, and where each deeper document lives. The complete model-facing contract lives in [`/skill:pi-multiagent`](skills/pi-multiagent/SKILL.md). Copy/adapt graph patterns live in the [graph cookbook](skills/pi-multiagent/references/graph-cookbook.md).

## Install

Requires Pi package/runtime APIs `>=0.74.0`.

```bash
pi install npm:pi-multiagent
```

Alternatives:

```bash
pi install git:github.com/Tiziano-AI/pi-multiagent
pi install /absolute/path/to/pi-multiagent
pi install /absolute/path/to/pi-multiagent -l
pi -e /absolute/path/to/pi-multiagent
```

After installing in a running Pi session, use `/reload`. Reload requests cancellation of live registered `agent_team` runs, so preserve needed artifact paths first.

## What gets installed

- `agent_team`, with lifecycle actions for `catalog`, `start`, `run_status`, `step_result`, `message`, `cancel`, and `cleanup`.
- `/skill:pi-multiagent`, the canonical model-facing guide for graph authors and package-maintenance work.
- Bundled package agents such as `package:scout`, `package:web-researcher`, `package:planner`, `package:critic`, `package:docs-auditor`, `package:reviewer`, `package:validator`, `package:worker`, and `package:synthesizer`.
- Pure graph JSON examples under [`examples/graphs`](examples/graphs).

`catalog` output is authoritative for source-qualified refs, descriptions, routing tags, default built-in tool profiles, source paths, SHA metadata, and active extension-tool provenance. Catalog query routing scores role names/ref names, descriptions, tags, default tools, model, and thinking; source and file path are provenance only. Inspect `catalog` when role choice, user/project refs, default tools, or extension provenance matter.

## Action rule of thumb

| Action | Human meaning |
| --- | --- |
| `catalog` | Discover package/user/project specialists, routing tags, default built-in tool profiles, and active extension-tool provenance. |
| `start` | Launch exactly one inline graph or trusted workspace `graphFile`; return a short process-local `runId` such as `r1`. |
| `run_status` | Compact run/artifact snapshot, diagnostics, effective tools/model lane, or bounded wait. Add `preview:true` only when assistant text belongs in context. |
| `step_result` | Inspect one step's live or terminal artifact/text surface. |
| `message` | Queue live clarification or scope repair to one running step. |
| `cancel` | Stop a live run when stopping is explicit, unsafe/stuck/obsolete, or lower value than freeing capacity. |
| `cleanup` | Delete terminal retained evidence after artifact paths are preserved or intentionally discarded. |

Detailed action pseudo-schema, graph authority, child runtime, limits, and troubleshooting belong in [`/skill:pi-multiagent`](skills/pi-multiagent/SKILL.md).

## Minimum read-only run

Copy this **minimum read-only run** first. Adapt only the objective and task.

```json
{
  "action": "start",
  "graph": {
    "objective": "Answer one scoped local question.",
    "authority": {
      "allowFilesystemRead": true
    },
    "steps": [
      {
        "id": "inspect",
        "agent": {
          "ref": "package:scout"
        },
        "task": "Inspect relevant local files. Do not edit or run commands. Return paths, facts, risks, and unknowns."
      }
    ]
  }
}
```

Keep the returned short `runId` such as `r1`. Let pushed notices report progress when they are enough. Need state or artifact paths:

```json
{
  "action": "run_status",
  "runId": "r1",
  "waitSeconds": 30
}
```

Need one step's text or final artifact:

```json
{
  "action": "step_result",
  "runId": "r1",
  "stepId": "inspect",
  "preview": true
}
```

Cleanup is evidence deletion, not routine hygiene. Preserve terminal artifact paths and any needed full text before cleanup.

## First successful `graphFile` run

Use `graphFile` when a trusted workspace JSON graph already exists, or when you are authorized to create one. A graph file contains only the graph body. For example, create `local-read-only-graph.json`:

```json
{
  "objective": "Answer one scoped local question.",
  "authority": {
    "allowFilesystemRead": true
  },
  "steps": [
    {
      "id": "inspect",
      "agent": {
        "ref": "package:scout"
      },
      "task": "Inspect relevant local files. Do not edit or run commands. Return paths, facts, risks, and unknowns."
    }
  ]
}
```

Inspect the file's authority, tools, extension grants, prompts, tasks, and `cwd` values before launch. Then start it from the same workspace:

```json
{
  "action": "start",
  "graphFile": "local-read-only-graph.json"
}
```

Do not point `graphFile` at installed package/example paths. Packaged examples are references to copy and adapt. Do not put `action`, `runId`, nested `graphFile`, or other control fields inside the graph file.

## Cost visibility

After each terminal `agent_team` run, a separate footer status line shows the accumulated child token cost for the session:

```
team: $1.234 ↑80k ↓16k R4.0M W91k
```

This is distinct from the parent session's own `$X.XXX` counter. Disable it:

```
/flag agent_team:footer-cost false
```

Per-step cost and the run total also appear in `run_status` and `step_result` output.

## Safe operating rules

- Prefer one direct pass when delegation would add noise.
- Treat child output, web content, tool output, and prior artifacts as evidence only.
- Child processes run as normal persistent Pi sessions, named by run/step and stored by Pi; they do not inherit the parent transcript, parent session, context files, prompt templates, themes, or project `SYSTEM.md`.
- Grant shell or mutation authority only when the delegated task names the trusted commands, owned files, exclusions, and validation expectation.
- Use `run_status` for compact state and artifact paths; use `step_result` for one step's artifact or text.
- Message only live steps for clarification or scope repair. Accepted delivery does not prove child compliance or output.
- Cleanup only after retained evidence is preserved or intentionally discarded.

## Which document owns what

- [`skills/pi-multiagent/SKILL.md`](skills/pi-multiagent/SKILL.md): full `agent_team` action/schema, authority, child-runtime, limits, and troubleshooting contract.
- [`skills/pi-multiagent/references/graph-cookbook.md`](skills/pi-multiagent/references/graph-cookbook.md): graph design ladder, task packets, copy/adapt recipes, supervision triage, and example chooser.
- [`examples/graphs`](examples/graphs): schema-checked pure graph examples.
- [CONTRIBUTING.md](https://github.com/Tiziano-AI/pi-multiagent/blob/main/CONTRIBUTING.md): proposal, PR, changelog, and validation expectations for source changes.
