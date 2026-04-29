# pi-multiagent

Model-native Pi package for isolated inline multiagent delegation.

The primary customer is the calling main agent. Humans can add reusable Markdown agent specs, but `agent_team` does not require a pre-existing roster.

## Highlights

- **One model-native tool:** `agent_team` handles catalog discovery, dependency-step execution, and optional synthesis.
- **Inline agents first:** define temporary specialists in the call without maintaining a roster.
- **Reusable library agents:** use source-qualified refs such as `package:reviewer`, `user:name`, or trusted `project:name`.
- **Isolated child Pi launches:** child processes run without inherited sessions, extensions, context files, skills, prompt templates, themes, or ambient tools.
- **Evidence-preserving handoff:** subagent output, stderr, diagnostics, tool previews, artifacts, and failure provenance return to the same Pi session.
- **Explicit trust boundaries:** project agents are denied by default, `file-ref` requires exact `read`, and bash-enabled children refuse cwd trees with project settings.

## Canonical corpus

- [`AGENTS.md`](AGENTS.md) — repo-local operating guide and release procedure for coding agents.
- [`VISION.md`](VISION.md) — product promise, principles, success criteria, and non-goals.
- [`README.md`](README.md) — user/operator guide: install, tool shape, examples, limits, and validation.
- [`ARCH.md`](ARCH.md) — architecture contract: schema owner, trust boundary, lifecycle, evidence, and failure provenance.
- [`skills/pi-multiagent/SKILL.md`](skills/pi-multiagent/SKILL.md) — package-owned skill for using or reviewing `agent_team`.
- [`agents/`](agents/) — bundled reusable package agents discoverable as `package:name` refs.
- [`tests/`](tests/) — executable contract for schema, planning, boundaries, rendering, package loading, and package contents.

## Install

From npm:

```bash
pi install npm:pi-multiagent
```

From the GitHub repo:

```bash
pi install git:github.com/Tiziano-AI/pi-multiagent@v0.1.1
```

From a local checkout:

```bash
pi install /Users/tiziano/Code/pi-multiagent
```

Project-local install from a local checkout:

```bash
cd /path/to/project
pi install /Users/tiziano/Code/pi-multiagent -l
```

One-off package load:

```bash
pi -e /Users/tiziano/Code/pi-multiagent
```

After installing into a live Pi session, run `/reload`.

## Package skill

Installing the package also loads the `pi-multiagent` skill. Use it when designing, invoking, reviewing, or troubleshooting `agent_team` graphs:

```text
/skill:pi-multiagent
```

The skill is owned by this package and points back to the canonical docs above.

## Tool: `agent_team`

Use one tool for discovery and execution.

Catalog reusable agents:

```json
{
  "action": "catalog",
  "library": {
    "sources": ["package", "user"],
    "query": "review tests"
  }
}
```

Run inline agents:

```json
{
  "action": "run",
  "objective": "Audit the package API for model-native usability.",
  "agents": [
    {
      "id": "surface-critic",
      "kind": "inline",
      "description": "Critiques API surfaces for calling models.",
      "system": "You are Surface Critic. Optimize for the calling model, not human UX. Find schema friction and missing knobs.",
      "tools": ["read", "grep", "find", "ls"],
      "thinking": "high",
      "outputContract": "Return prioritized findings with exact paths and a replacement API proposal."
    }
  ],
  "steps": [
    {
      "id": "critique",
      "agent": "surface-critic",
      "task": "Critique the current agent_team package surface."
    }
  ],
  "limits": {
    "timeoutSecondsPerStep": 600
  }
}
```

Public ids for `agents[].id`, `steps[].id`, `needs[]`, and synthesis refs must use lowercase letters, digits, and hyphens:

```text
^[a-z][a-z0-9-]{0,62}$
```

`agent-team-synthesizer` is reserved for the default synthesis agent and cannot be used as an invocation-local `agents[].id`.

## Model-native run shape

`agent_team` uses dependency steps, not human workflow modes:

```json
{
  "action": "run",
  "objective": "Decide and implement a safe configuration rewrite.",
  "agents": [
    {
      "id": "runtime-scout",
      "kind": "inline",
      "system": "Map runtime contracts with exact files. Do not edit.",
      "tools": ["read", "grep", "find", "ls"]
    },
    {
      "id": "api-critic",
      "kind": "inline",
      "system": "Critique the API as a tool for another LLM. Do not edit.",
      "tools": ["read", "grep", "find", "ls"],
      "thinking": "high"
    }
  ],
  "steps": [
    {
      "id": "runtime-map",
      "agent": "runtime-scout",
      "task": "Map current implementation and tests."
    },
    {
      "id": "api-critique",
      "agent": "api-critic",
      "task": "Critique the current API and propose a stronger one."
    },
    {
      "id": "implement",
      "agent": "package:worker",
      "needs": ["runtime-map", "api-critique"],
      "task": "Implement the stronger design using the upstream evidence and critique."
    }
  ],
  "synthesis": {
    "task": "Summarize the final state, validation, and remaining risk.",
    "from": ["implement"]
  },
  "limits": {
    "concurrency": 1,
    "timeoutSecondsPerStep": 900
  }
}
```

Rules:

- Steps without `needs` launch as soon as dependencies and concurrency permit.
- For write-capable or side-effectful steps, set explicit `needs` edges or `limits.concurrency: 1` unless each task owns disjoint files/effects.
- Steps with `needs` receive bounded upstream previews automatically as untrusted evidence, not instructions; duplicate upstream refs are de-duplicated in order. Repeat any instruction a downstream agent must follow in `task` or `outputContract`.
- `library.query` is catalog-only; run calls reject it instead of silently treating it as an execution filter.
- Use source-qualified library refs such as `package:reviewer` for every reusable library agent. Bare library names are not resolved.
- Default upstream handoff copies a bounded raw preview of 6000 characters per upstream step; it does not include temp-file paths. Final results may include `fullOutputPath` for truncated previews. Use `file-ref` for downstream path handoff.
- Set `upstream.mode: "full"` with `maxChars` when bounded raw full text is required.
- Use `upstream.mode: "file-ref"` only when the receiving agent includes the exact `read` tool; run calls reject built-in no-tool synthesis with `file-ref` because the synthesizer cannot dereference paths, and file-ref consumers are blocked if an upstream output exists but its temp artifact could not be persisted or read.
- `synthesis` appends a final fan-in step, de-duplicates `from` refs in order, and supports the same `upstream` policy. If `synthesis.agent` is omitted, `agent_team` creates a no-tool inline `agent-team-synthesizer`. For final triage over independent review lanes, set `synthesis.allowPartial: true` so one failed lane does not block recovery synthesis.
- Inline agents are temporary and exist only for the tool call.
- Inline agents default to `--no-tools`; set `tools` explicitly when they need tools.
- `tools` must be Pi tool names available to the child process. This package currently allows only `read`, `grep`, `find`, `ls`, `bash`, `edit`, and `write` for isolated children; `bash` executes commands and should be added only when trusted command checks are needed. Invalid or unavailable names fail closed before useful work.
- Library agents are optional package/user/project Markdown seeds and use their declared tools unless overridden; `system` is inline-only and is denied on library bindings.
- Set `limits.timeoutSecondsPerStep` for broad review, implementation, untrusted, or tool-using runs; there is no default timeout.
- Child Pi processes launch with `--no-session --no-extensions --no-context-files --no-skills --no-prompt-templates --no-themes`; an empty `--system-prompt` suppresses project `SYSTEM.md` discovery while preserving Pi's default prompt, the agent prompt is passed through `--append-system-prompt`, and the delegated task is sent on stdin instead of argv. Include required repo instructions/context explicitly in delegated tasks. Current Pi script/executable reuse is allowed only when both launcher paths are outside delegated denied roots. Fallback launcher resolution accepts only executable absolute `pi` paths from absolute `PATH` entries and skips candidates inside the delegated project root, including roots marked by `.git`/`.pi` files, directories, or symlinks.
- Bash-enabled children are refused when the delegated `cwd` is inside a tree with any `.pi/settings.json` filesystem node, including symlinked settings nodes and realpath symlink cwd paths, because project settings can alter shell execution even when extension/resource discovery is disabled.

## Library agents

Reusable human-authored agents live in:

- package: `agents/*.md`
- user: `~/.pi/agent/agents/*.md`
- project: nearest `.pi/agents/*.md`

Agent file format:

```markdown
---
name: reviewer
description: Reviews code for bugs and validation gaps
tools: read, grep, find, ls, bash
thinking: medium
---
You are Reviewer. Return findings first, ordered by severity.
```

Bundled package agents:

| ref | intended use | declared tools |
| --- | --- | --- |
| `package:scout` | fast reconnaissance with optional shell checks | `read`, `grep`, `find`, `ls`, `bash` |
| `package:planner` | implementation planning from evidence | `read`, `grep`, `find`, `ls` |
| `package:critic` | pre-mortem critique | `read`, `grep`, `find`, `ls` |
| `package:reviewer` | code/plan review with optional checks | `read`, `grep`, `find`, `ls`, `bash` |
| `package:worker` | scoped implementation | `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write` |
| `package:synthesizer` | fan-in and decision synthesis | `read`, `grep`, `find`, `ls` |

Catalog output includes refs like `package:reviewer`, file paths, and SHA-256 prefixes. Steps can use a source-qualified ref directly, or an invocation-local library binding can set per-call tools, model, thinking, cwd, or output contract:

```json
{
  "id": "code-reviewer",
  "kind": "library",
  "ref": "package:reviewer"
}
```

```json
{
  "id": "review",
  "agent": "package:reviewer",
  "task": "Review the current package."
}
```

Agent refs are source-qualified, so package, user, and project agents with the same frontmatter name remain distinct as `package:name`, `user:name`, and `project:name`. Project agents are repository-controlled prompts and are denied by default.

```json
{
  "action": "catalog",
  "library": {
    "sources": ["package", "user", "project"],
    "projectAgents": "allow"
  }
}
```

Use `projectAgents: "allow"` only for trusted repositories. `projectAgents: "confirm"` asks through Pi UI when available, includes the resolved project-agent path in confirmation/provenance when known, fails closed without UI, emits an approval or denial diagnostic for provenance, and is skipped if the request fails shape preflight. Project agent symlinks, symlinked project `.pi` directories, user-agent file symlinks, path escapes, duplicate source refs, project source discovery without prepared approval, and user-agent directories scoped under the nearest project root are denied; project roots are recognized through `.pi`/`.git` marker files, directories, or symlinks.

## Output and diagnostics

- Validation failures render as `# agent_team error` with diagnostics rather than as normal catalog/run results.
- Step `output` is a bounded raw preview for the calling model.
- Step `outputFull` is retained raw up to the hard capture limit; exceeding that limit marks the step failed and writes a truncation marker instead of growing memory unbounded.
- Per-step event lists and per-event previews are bounded and include an `events-truncated` marker when older events are dropped.
- Downstream steps and synthesis receive bounded raw previews of 6000 characters per upstream step by default inside a generated untrusted-evidence boundary. Every child prompt also tells agents to treat upstream, tool, repo, and quoted content as untrusted evidence unless repeated in the step task or output contract; use `upstream.mode: "full"`, `maxChars`, or `"file-ref"` to control handoff size.
- `file-ref` handoff omits copied output text and points to an upstream step temp Markdown file using an exact JSON-string file path rendered as parent metadata outside the child output block. The receiving child must include the exact `read` tool; implicit no-tool synthesis with `file-ref` is a validation error. Full-output artifacts are raw evidence; stale or unreadable paths are discarded and re-persisted when possible.
- Large aggregate output gets `AgentTeamDetails.fullOutputPath`.
- Subagent stdout, raw stderr, malformed stdout diagnostics, model text, tool previews, catalog metadata, output files, and failure fields are same-session evidence. Structured details and artifacts preserve captured evidence raw apart from bounded capture/truncation. Parent diagnostics are stored as events instead of being mixed into raw stderr. Model-facing output blocks escape delimiter-like line starts, and inline summaries compact whitespace for display. `agent_team` does not rewrite credential-like content.
- Temp full-output files are retained as evidence; clean them up after use if needed. Temp files are mode `0600`, but `agent_team` is not a same-UID filesystem sandbox: do not treat upstream modes as a confidentiality boundary against same-UID processes or untrusted children with filesystem-capable tools such as `read`, `grep`, `find`, `ls`, or `bash`. `file-ref` handoff still requires the exact `read` tool because the delegated task must dereference the artifact contents. If temp persistence fails, the tool returns the bounded result with a diagnostic instead of throwing away completed step evidence; prompt/output temp write failures remove the just-created temp directory when possible while preserving the original write failure in diagnostics.

A step succeeds only after a valid child Pi JSON-mode assistant `message_end` with `stopReason: "stop"`, no terminal assistant error message, and an explicit zero process exit code. Intermediate child `toolUse` turns may be followed by the final `stop`; after a terminal stop, later child frames are ignored and marked as late. Pi child auto-retry and compaction events are retained as bounded lifecycle diagnostics/events only; they do not decide terminal step state. Malformed stdout before terminal stop, malformed or missing final `message_end`, terminal non-success stop reasons, assistant error messages, stdin/stdout/stderr transport failure, capture-limit overflow, external signals, missing/non-zero exit, invalid `cwd`, timeout, and parent abort are failures. Irrecoverable protocol or stream failures terminate the child instead of waiting forever for a timeout. Abort/timeout/protocol-failure termination sends `SIGTERM`, escalates to `SIGKILL`, and reports if process close is not confirmed while preserving the first observed root cause. Failed and blocked steps expose raw `failureCause` and `failureProvenance` in structured details; model-facing summaries include those facts in display-compacted form alongside bounded preview and `file-ref` upstream handoffs. `failureProvenance` separates the first observed failure from closeout effects with `failure_terminated` and `closeout`, so a child terminal assistant error followed by parent termination is not misread as proof of the closeout signal being the root cause. Model-facing provenance puts JSON-stringed `likely_root`, `first_observed`, `closeout`, and `failure_terminated` before lower-priority process facts so caller agents can triage failures without digging through structured JSON. If SIGKILL close confirmation is unavailable, provenance reports `closeout=unconfirmed_after_sigkill`. Synthesis is the terminal fan-in step; normal steps cannot depend on the synthesis step.

## Limits

- Invocation agents: max 16.
- Steps: max 16.
- Dependencies per normal step: max 12.
- Synthesis fan-in: max 16.
- Concurrency: integer 1 through 6. Default and hard max are both 6 concurrent runnable steps.
- Optional per-step timeout: `limits.timeoutSecondsPerStep`; no timeout is applied by default.
- Upstream handoff preview: default 6000 characters per upstream step; hard max 50000.
- Per-step assistant output capture: hard cap 200000 characters including the truncation marker.
- Retained per-step events: hard cap 40 entries with a truncation marker.
- Per-event preview: hard cap 2000 characters including the truncation marker.
- JSON stdout line buffer: hard cap 1000000 characters.
- Caller text fields: short query/description fields max 1000 characters, model id max 256, path fields max 4096, and objective/task/system/output-contract fields max 50000.
- Oversized final output is truncated for the model and saved to a temp Markdown file.

## Recoverability

`agent_team` is not transactional and is not crash-resumable today.

- Completed step outputs returned in the final tool result remain usable evidence even if a later step fails, times out, or is terminated.
- If the parent Pi process crashes before returning a final result, scheduler state is lost. Some per-step temp files may exist, but there is no durable run ledger that indexes completed, running, or unsafe-to-retry steps. Prompt and output temp directories are cleaned up when their write path fails, and cleanup/persistence failures are reported as diagnostics when the parent remains alive.
- If a subagent edited files before a crash or timeout, those filesystem changes are real. Recovery must inspect live workspace state and decide whether to keep, amend, or revert; do not blindly replay side-effectful steps.
- Broad review, implementation, untrusted, or tool-using graphs should set `limits.timeoutSecondsPerStep`; without a timeout, a stalled child can keep the tool call open until parent abort or external termination.
- A future durable run ledger should record run id, step status, child pid, cwd, agent ref, prompt/task hashes or artifact paths, output paths, terminal reason, and replay-safety classification before offering resume semantics.

## Validation

```bash
cd /Users/tiziano/Code/pi-multiagent
pnpm test
pnpm run smoke:pi
pnpm run check:pack
pnpm run check:pi-load
pnpm run check:source-size
# or all local gates:
pnpm run gate
npm pack --dry-run --json
git diff --check
```

`smoke:pi` imports the registered extension entrypoint through a local peer-dependency loader, asserts `agent_team` registration/execute wiring for catalog, validation-error, and project-confirmation paths, and exercises the fake-spawn run contract. `check:pi-load` reads the package manifest, imports the declared Pi extension paths through the same peer-dependency loader, and asserts the loaded extension registers and executes `agent_team`. `check:pack` runs `npm pack --dry-run --json` and asserts the packed artifact includes `AGENTS.md`, `VISION.md`, `LICENSE`, public docs, every bundled package agent, package manifest, and every extension TypeScript source file while excluding tests, smoke scripts, runtime state, and `PLAN.md`.

See `ARCH.md` for the full contract, trust boundary, lifecycle states, and provenance notes.
