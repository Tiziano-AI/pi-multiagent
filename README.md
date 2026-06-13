# pi-multiagent

`pi-multiagent` installs one Pi extension tool, `agent_team`, plus the `/skill:pi-multiagent` agent guide and schema-checked graph examples.

Use `agent_team` when independent helper context materially improves a task: local reconnaissance, current web research, critique, validation proof, implementation review, or fan-in synthesis. The parent assistant remains the lead. Child output is evidence, not instructions. Child processes do not inherit the parent transcript, session, context files, prompt templates, themes, project `SYSTEM.md`, or ambient skill discovery. Subagent skill propagation is product-configured all-or-nothing: `--agent-team-subagent-skills enabled|disabled`, default `enabled`, passes all caller-visible Pi skills when enabled, and passes none when disabled. A child inherits the parent Pi model and thinking defaults at `start` launch time unless its agent metadata pins a model or thinking level; switching the parent model later does not hot-swap live children. Child model/provider availability follows normal Pi extension discovery for the child cwd and agent dir; explicit `extensionTools` grants are only for callable extension tools.

This README is the **human/operator path** for install, trust, lifecycle, limits, first run, and source validation. The complete model-facing invocation contract lives in [`/skill:pi-multiagent`](skills/pi-multiagent/SKILL.md); graph choreography lives in the [graph cookbook](skills/pi-multiagent/references/graph-cookbook.md).

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

After installing in a running Pi session, use `/reload`. Reload requests cancellation of live registered `agent_team` runs. Before reloading, call `run_status`, preserve needed artifact paths, and cancel only work that is safe to stop.

## What gets installed

- `agent_team`, with actions `catalog`, `start`, `run_status`, `step_result`, `message`, `cancel`, and `cleanup`.
- `/skill:pi-multiagent`, the canonical agent-facing usage and maintenance guide.
- Bundled package agents such as `package:scout`, `package:web-researcher`, `package:planner`, `package:critic`, `package:docs-auditor`, `package:reviewer`, `package:validator`, `package:worker`, and `package:synthesizer`.
- Pure graph JSON examples under [`examples/graphs`](examples/graphs).

`catalog` output is authoritative for source-qualified refs, descriptions, routing tags, default built-in tool profiles, source paths, SHA metadata, and active extension-tool provenance. Catalog query routing scores role names/ref names (the name portion of source-qualified refs), descriptions, tags, default tools, model, and thinking only; source and file path stay provenance, not ranking signals. Do not duplicate a role table from memory; inspect `catalog` when role choice, user/project refs, default tools, or extension provenance matter.

## Action rule of thumb

| Action | Human meaning |
| --- | --- |
| `catalog` | Discover package/user/project specialists, routing tags, default built-in tool profiles, and active extension-tool provenance. |
| `start` | Launch exactly one inline graph or trusted workspace `graphFile`; return a short process-local `runId` such as `r1`. |
| `run_status` | Compact run/artifact snapshot, diagnostics, effective tools/model lane, or bounded wait with a structured `waitSeconds` receipt. Assistant text previews require `preview:true`; raw events require `debugEvents:true`. |
| `step_result` | Inspect one step's live or terminal artifact/text surface. Assistant text previews require `preview:true`. |
| `message` | Queue live clarification or scope repair to one running step. |
| `cancel` | Stop a live run when stopping is explicit, unsafe/stuck/obsolete, or lower value than freeing capacity. |
| `cleanup` | Delete terminal retained evidence after artifact paths are preserved or intentionally discarded. |

Detailed action pseudo-schema belongs in the skill. Do not send read controls such as `cursor`, `waitSeconds`, `maxBytes`, `preview`, or `debugEvents` to `catalog` or `start`; `catalog` is narrowed with `library.query`. Schema-admissible action-shape failures render as `# agent_team error` with repair copy and are marked as Pi tool-result errors when the package returns `ok:false`, so transcript/session consumers can distinguish failed `agent_team` actions from successful receipts.

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

Let pushed notices report progress. Need state or artifact paths:

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

Cleanup is evidence deletion, not routine hygiene. Preserve the short `runId`, status, terminal artifact paths, and any needed full text before cleanup.

## Lifecycle and evidence

`start` returns a usable short registered `runId` such as `r1` or leaves no child process alive. The handle is not a secret or high-entropy bearer token; it is a convenience handle inside the current Pi session and extension process. Follow-up actions from another Pi session in the same process treat the handle as not found. Parent abort before registration cancels setup; parent abort after `runId` does not kill the detached run. In the interactive TUI, Escape cancels or aborts the parent surface; after `start` has returned a `runId`, use explicit `agent_team cancel` to stop the detached work. Live and retained run registries are process-local; on Pi session shutdown or reload the extension requests cancellation of live registered runs owned by that session, but `agent_team` is not crash-resumable and in-memory `runId`s should not be treated as recoverable after reload.

In short, pushed notices are compact human receipts and omit the full child transcript. Terminal notices include terminal step artifact paths and retention expiry when available; milestone notices stay compact. Interactive Pi live progress is rendered by the `agent_team:live` widget and notice messages; `agent_team` does not publish transient run/lane counts into Pi's shared footer status row. Pushed notices are delivered only while the Pi session that started the short `runId` is still the active delivery target; if you switch sessions, use `run_status` after returning to the starting session. Use `run_status` for sink artifact indexes, all terminal step artifact metadata, diagnostics, bounded task previews, cwd/upstream references, and stop/status hints; use `step_result` for one non-sink or sink step. Full assistant finals are retained in tmp artifact files until retention expiry or cleanup. Failed, canceled, or timed-out steps that have no successful final may retain bounded `Non-final assistant evidence` in their terminal artifact so partial text is visible without being treated as a completed child answer; final artifacts also include launch metadata such as effective tools, extension tools, model/thinking lane, cwd, and upstream artifact references. If a child Pi reports context overflow and then Pi compacts/continues to a later valid assistant final, `agent_team` treats the overflow as a recovery boundary; stale pre-overflow text is not accepted as success. If no valid post-recovery final arrives before closeout or timeout, the step fails with an unrecovered-overflow diagnostic and `needs` dependents stay blocked.

Retained detached runs keep terminal metadata and artifact paths only inside the current extension process. Cleanup frees only terminal retained runs and deletes package-owned retained evidence. Preserve artifacts before cleanup when they may support handoff, compaction recovery, chained graphs, or release proof.

## Graph and authority boundaries

Graphs are static DAGs. Bind each step to either inline `agent.system` or a source-qualified `agent.ref`; model synthesis as a normal dependent step. Use `needs` for success-gated dependencies and `after` when a downstream step should consume terminal evidence from failed or blocked lanes too. Sink steps, not array order, define caller-facing finals.

Every child process keeps at least the filesystem read/discovery suite (`read`, `grep`, `find`, `ls`), so every runnable graph needs `authority.allowFilesystemRead:true`. Omit `agent.tools` for a catalog role to inherit its catalog `defaultTools` capped by graph authority; explicit `agent.tools` replaces the whole profile and then mandatory read/discovery is added. Use `agent.tools:[]` only to drop non-read catalog defaults while keeping read/discovery.

Child Pi launches use normal Pi extension discovery so extension-provided model providers are available. Ambient trusted extensions may run startup code, provider hooks, tool hooks, and resource discovery as normal Pi behavior. `--tools` remains the callable tool-name allowlist; it is not an extension-code sandbox and extension tools can shadow tool names under normal Pi semantics. Graph authority does not disable or gate this normal Pi extension discovery. Child RPC is unattended: fire-and-forget extension UI updates such as status, notifications, widgets, titles, and editor text are recorded as suppressed non-error activity, while blocking or unknown UI requests fail closed. Child `tool_execution_end` records with `isError:true` are preserved as error-status tool activity in debug events and compact `lastActivity`; they do not automatically fail a step that later recovers and produces a valid final.

Subagent skills are not graph-controlled: `steps[].agent.skills` is rejected. The product flag `--agent-team-subagent-skills enabled|disabled` defaults to `enabled`; enabled children receive every caller-visible Pi skill, and their prompt reminds them to use relevant available skills. Skills never grant tools, graph authority, mutation permission, or broader task scope. Enabled mode is all-or-nothing: unreadable visible skill sources or an inactive parent `read` tool fail planning; use `--agent-team-subagent-skills disabled` to pass no caller skills.

Authority is graph-wide:

| Graph authority | Allows |
| --- | --- |
| `allowFilesystemRead` | Filesystem read/discovery: `read`, `grep`, `find`, `ls`. |
| `allowShellTools` | `bash`; bash can mutate through commands. |
| `allowMutationTools` | Structured `edit` and `write`. |
| `allowExtensionCode` | Explicit callable extension-tool grants copied from `catalog` as `extensionTools`; not a global switch for normal Pi extension discovery. |

`allowShellTools` grants trusted shell execution to child steps whose effective built-in tools include `bash`. Shell commands run with the child process authority, so use shell lanes only for parent-approved command proof or probes, keep the task text exact, and prefer serialized validator lanes for important command evidence. `package:validator` fails planning unless effective tools include `bash`; use `package:reviewer` for non-command review. `allowMutationTools` grants trusted mutation execution through `edit` and `write`; use it only for currently authorized implementation work, with the owned files, exclusions, and validation commands stated in the worker task. `package:worker` fails planning unless effective tools include `edit` or `write`; use `package:planner` or `package:reviewer` for non-mutating work.

A step `cwd` narrows launch working context to an existing directory inside the invocation cwd. Symlinked, missing, non-directory, and path-escaping cwd values are denied, and cwd identity is rechecked immediately before launch. Bash-enabled steps are refused when the effective `cwd` tree contains `.pi/settings.json`.

## First successful `graphFile` run

`graphFile` points to a pure relative graph JSON file inside cwd, not an action wrapper. Use it when a trusted workspace graph file already exists, or when you are authorized to create one. For a first success, create `local-read-only-graph.json` in the current workspace with only the graph body:

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

Inspect authority, tools, extension grants, prompts, tasks, and `cwd` values before launch. Then start the copied workspace file:

```json
{
  "action": "start",
  "graphFile": "local-read-only-graph.json"
}
```

Need headless supervision or artifact paths:

```json
{
  "action": "run_status",
  "runId": "r1",
  "waitSeconds": 30
}
```

Need the step text:

```json
{
  "action": "step_result",
  "runId": "r1",
  "stepId": "inspect",
  "preview": true
}
```

Cleanup is evidence deletion. Preserve the short `runId`, status, terminal artifact paths, and any needed full text before cleanup.

Packaged examples are references to copy and adapt; they are not loaded by package path and are not a runtime template API. Do not point `graphFile` at installed package/example paths. Do not put `action`, `runId`, nested `graphFile`, or other control fields inside the graph file.

## Messages and supervision

After `start`:

- Running notice and no evidence needed: keep working.
- Need compact state, artifact paths, diagnostics, effective tools, child tool-error breadcrumbs, or the launch-time child model lane: `run_status`.
- Need to wait without pushed notices, including JSON/API/headless supervision: `run_status` with `waitSeconds`; it wakes on material events, not routine assistant/tool/UI activity, and returns a receipt such as `material`, `timeout`, `already-material`, or `terminal`.
- Need incremental wait/debug reads: pass the returned `Cursor` value back as `run_status.cursor`; it is a process-local event cursor, not a run handle or artifact path.
- Need one step's live/final text or non-sink artifact: `step_result` with `preview:true` only when text belongs in context. `run_status.stepId` filters waits/debug events only; use `step_result` for step text.
- Need scope repair: `message` one live step.
- Work is unsafe, obsolete, stuck, or explicitly stopped: `cancel`.
- Run is terminal and evidence is preserved or discarded: `cleanup`.

`message` is not post-terminal chat. `steer` queues delivery after the current child assistant turn finishes tool calls and before the next LLM call. `follow_up` defers a live follow-up until the child is quiescent before terminalization, if still messageable. Exact duplicate keys reuse the original receipt, whether accepted, denied, or timed out. Accepted means accepted for delivery to the live child, not read, obeyed, included in output, completed, terminalized, or safe to stop early.

## Graph examples

Copy/adapt warning: packaged examples are skeletons for positive graph shapes. Do not run them verbatim; replace objective, paths/components, trusted command list or file set in the task text, stop condition, expected output fields, and human decision question before starting the graph.

The packaged set covers single-specialist, inline fan-in, cwd-launched fanout, read-only fanout, map-reduce, tree-reduce, sharded map-reduce, artifact-chained follow-up, product-experience source audit, evidence-trace audit, human-gated planning, command validation, validation matrix, completed proof review, model-facing docs audit, release readiness, and research-to-change planning. Browse [`examples/graphs`](examples/graphs) and the [graph cookbook](skills/pi-multiagent/references/graph-cookbook.md).

Use `release-readiness-review.json` for the default non-mutating read/shell release proof path. `package:web-researcher` fails planning before child launch unless the step grants explicit callable `exa_search` and `exa_fetch` `extensionTools` copied from live `catalog` provenance with `allowExtensionCode:true`; cookbook web patterns stay copy/adapt because public examples cannot know local provenance.

Before starting any graph with `bash`, verify the graph authority is limited to the intended shell grant and the step task states the exact trusted commands or command class. Before starting a mutation-capable graph, verify exact parent authorization, owned files or mutation class, exclusions, and validation commands in the worker task. Graph gates are model-level dependencies, not human approval checkpoints; use separate runs when a human decision must occur before mutation.

## Limits

| Item | Limit |
| --- | --- |
| Steps | 16 |
| Dependencies per step | 12 |
| Concurrency | 1 to 10; default 6 |
| Per-step timeout | 1 to 36000 seconds; `timeoutSecondsPerStep` defaults to 7200 seconds |
| Max run time | 1 to 86400 seconds; default 86400 seconds |
| Terminal retention | 1 to 604800 seconds; default 86400 seconds |
| `run_status` wait | `waitSeconds` max 60 seconds |
| Live detached runs | 16 live runs per extension process; completion or cancel frees live capacity |
| Retained detached runs | 64 retained runs per extension process, including live and terminal runs; cleanup frees only terminal retained runs |
| Run handle | Short process-local `runId` values `r1` through `r9999999`; not a secret, cross-session identifier, or recycled within one extension process; usable only by the Pi session that started the run |
| Pushed notices | `none`, `final`, or `milestones`; default `milestones`; max 100 non-terminal notices; default 12; minimum interval default 10 seconds, max 3600; session-owned delivery only while the starting Pi session is active |
| Inline upstream handoff | 12000 chars per dependency; larger upstream sends a 2000-char preview plus artifact path |
| `run_status`/`step_result` model-facing output | Compact formatter cap is owned by Pi/package display; `preview` defaults false, and full artifacts are not trimmed |
| Final preview per step | Optional `preview:true`; 6000 chars plus full tmp artifact path |
| Graph file input | Relative `.json` file inside cwd; 256 KiB max |
| Agent file input | 128 KiB per library agent Markdown file |
| Retained events per run | 2000 |
| Per-event preview | 2000 chars |
| Parent message budget per live step | 16 message attempts or 65536 sent message chars |
| Retained assistant output per step | 4194304 bytes across non-empty assistant finals; max 64 non-empty assistant finals |
| RPC JSONL record parse cap | 8 MiB |

## Troubleshooting quick checks

| Symptom | Check |
| --- | --- |
| `run` is rejected | Use `start`, then `run_status`; `run` is intentionally absent. |
| Catalog has no expected role | Omit the query or use concise routing terms; check `library.sources` and package/user/project scope. |
| Bare ref is rejected | Use a source-qualified ref such as `package:reviewer`. |
| Project agents do not load | For start, set `graph.library.sources:["project"]`; for catalog, use `library.sources:["project"]`. Project and user library sources load when requested and present. |
| `graphFile` is rejected | Use a pure relative graph JSON file inside cwd; do not include `action`, `runId`, or nested `graphFile`. |
| Built-in tool is rejected | Add `allowFilesystemRead:true`; add shell/mutation authority only when the delegated task really needs trusted shell or edit/write tools. `package:validator` requires effective `bash`; `package:worker` requires effective `edit` or `write`. |
| Extension tool is rejected | Keep callable extension grants in `extensionTools` and copy source/scope/origin from `catalog`. |
| Which model did a child run? | Check `run_status` step rows; they report the launch-time model/thinking lane. Parent model changes after `start` do not affect live children. |
| Provider model is unavailable in a child | Install or enable the provider extension through normal Pi extension discovery for the child cwd/agent dir; one-off parent `pi -e` provider extensions are not inherited. |
| Bash child is refused | Step cwd is inside a tree with `.pi/settings.json`; remove `bash`, change cwd, or run outside that settings tree. |
| Message is denied or seems ignored | Target step may not be live, the run may be terminal/canceling, budget may be spent, or the accepted-for-delivery receipt may not have produced child output/compliance. |
| Need upstream output | Use `step_result` for that step; add `preview:true` for bounded text or read the artifact path for full text. |
| Terminal step has empty final text | Treat it as failed evidence; current runtime marks empty assistant finals failed with `assistant-final-empty`. |
| Context overflow appears in child RPC | Recoverable overflow waits for Pi compaction/continue and only succeeds on a later valid final; unrecovered overflow fails and blocks `needs` dependents. |
| Need raw event records | Use `run_status` with `debugEvents:true`; default run_status is intentionally compact. |
| Cleanup is denied | Confirm terminal state first; cleanup is unavailable for live runs. |

## Validate the package

```bash
cd /path/to/pi-multiagent
pnpm run gate
npm pack --dry-run --json
git diff --check
```

`pnpm run gate` runs TypeScript typechecking, unit tests, fake Pi smoke, package-content checks, package-load checks, public-doc checks, and source-size checks. `npm pack --dry-run --json` proves the package file list and metadata without creating a tarball.

Optional real-runtime smoke may spend model/API credentials and invoke local Pi. Run it only with explicit operator approval; otherwise record it as deferred:

```bash
PI_MULTIAGENT_REAL_SMOKE=1 PI_MULTIAGENT_REAL_SMOKE_TIMEOUT_MS=180000 pnpm run smoke:pi
```

For major rewrites or live integration changes, static gates and toy smokes are not enough. Run a meaningful articulated graph, supervise it with pushed notices, compact `run_status`, bounded `run_status.waitSeconds`, targeted `step_result`, and `debugEvents:true` only for package debugging. Inspect or preserve terminal artifacts before cleanup. A stalled, canceled, or final-less serious graph is NEEDS-WORK, not GO.

## Contributing

Small focused bug fixes can be proposed as normal pull requests. Large changes that affect public `agent_team` schema, lifecycle, trust, persistence, scheduling/background execution, mutation behavior, provider/model integration, package-agent semantics, or release flow need a GitHub proposal issue before implementation.

Contributor PRs should start from current `origin/main`, stay scoped, preserve the current public contract unless an accepted proposal changes it, avoid package version bumps, keep unreleased notes under `CHANGELOG.md` `## Unreleased`, and include fresh gate output. Release versioning, npm publish, git tags, pushes, and GitHub Releases are maintainer-owned.

See the public contributor guide: <https://github.com/Tiziano-AI/pi-multiagent/blob/main/CONTRIBUTING.md>.

## Reference

- [`skills/pi-multiagent/SKILL.md`](skills/pi-multiagent/SKILL.md): complete canonical agent-facing invocation and maintenance guide.
- [`skills/pi-multiagent/references/graph-cookbook.md`](skills/pi-multiagent/references/graph-cookbook.md): graph choreography, examples, and copy/adapt patterns.
- [`examples/graphs`](examples/graphs): schema-checked pure graph examples.
