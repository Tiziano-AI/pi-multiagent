# pi-multiagent architecture

## Role

`pi-multiagent` is a Pi package for bounded multi-agent delegation from the current parent conversation.

The package exposes one tool:

- `agent_team`

`agent_team` lets the caller define temporary inline agents, use source-qualified library agents, express work as dependency steps, and request synthesis.

Delegated agents run as isolated child Pi processes with `--mode json -p --no-session --no-extensions --no-context-files --no-skills --no-prompt-templates --no-themes`. Children do not inherit the parent session.

The child launch also passes an empty `--system-prompt` to suppress project `SYSTEM.md` discovery while preserving Pi's default coding prompt, appends the generated subagent prompt through `--append-system-prompt`, and sends the delegated task over stdin rather than argv.

Human-authored Markdown agent files are only a reusable library. They are not required for invocation. Graph cookbook JSON files are copyable examples, not a runtime template API.

## Canonical identity

- source root: repository or installed package root containing `package.json`
- GitHub repo: `https://github.com/Tiziano-AI/pi-multiagent`
- npm package: `pi-multiagent`
- Pi package manifest: `package.json` `pi.extensions` and `pi.skills`
- extension path: `extensions/multiagent/index.ts`
- public tool: `agent_team`
- package-owned skill: `skills/pi-multiagent/SKILL.md`
- skill graph cookbook: `skills/pi-multiagent/references/graph-cookbook.md`
- bundled reusable agents: `agents/*.md`
- schema-checked graph examples: `examples/graphs/*.json`

Runtime package installs under `~/.pi/agent/` or project `.pi/` settings are integration mountpoints, not source owners.

## Canonical docs and package corpus

The canonical public docs are `README.md`, `VISION.md`, `ARCH.md`, and `AGENTS.md`. `README.md` is the front-facing operator/evaluator guide, `VISION.md` owns product intent and non-goals, `ARCH.md` owns the normative runtime contract, and `AGENTS.md` owns repo-local work rules.

The canonical package corpus also includes `skills/pi-multiagent/SKILL.md`, `skills/pi-multiagent/references/graph-cookbook.md`, `examples/graphs/*.json`, `agents/*.md`, `package.json`, and relevant tests. Keep these surfaces synchronized when behavior, schema, package metadata, package skill text, examples, validation gates, or release flow changes.

The package-owned skill is a progressive-disclosure operating guide for agents deciding how to invoke, design, review, troubleshoot, or improve `agent_team` graphs and this package. It points back to the canonical docs rather than duplicating the full architecture.

The bundled `agents/*.md` files are not Pi skills. They are reusable `agent_team` library prompts surfaced as `package:name` refs during catalog/run calls.

The graph cookbook lives in the package-owned skill reference and `examples/graphs/*.json`, with README carrying human-facing install, first-success, troubleshooting, and concise example-index copy. These examples must remain schema-valid `agent_team` inputs, but they are documentation artifacts: callers copy and adapt them rather than invoking a separate template action.

## Public contract owner

The canonical process edge is `agent_team` input in `extensions/multiagent/src/schemas.ts`. Runtime normalization and denial live in `extensions/multiagent/src/planning.ts`, `extensions/multiagent/src/graph-file.ts`, `extensions/multiagent/src/library-policy.ts`, `extensions/multiagent/src/agents.ts`, `extensions/multiagent/src/handoff.ts`, and `extensions/multiagent/src/delegation.ts`.

The canonical shape is:

```ts
agent_team({
  action: "catalog" | "run",
  objective?: string,
  graphFile?: string,
  library?: {
    sources?: ("package" | "user" | "project")[],
    query?: string,
    projectAgents?: "deny" | "confirm" | "allow"
  },
  agents?: AgentSpec[],
  steps?: StepSpec[],
  synthesis?: SynthesisSpec,
  limits?: {
    concurrency?: number,
    timeoutSecondsPerStep?: number
  }
})
```

`graphFile` is a run-only wrapper for a complete graph stored as JSON. It is mutually exclusive with `objective`, `library`, `agents`, `steps`, `synthesis`, and `limits` in the wrapper call. Runtime resolves it relative to the current working directory, requires a regular `.json` file under that directory, denies symlinks and nested `graphFile`, and caps the file at 256 KiB before materializing the loaded graph through the normal run contract.

Public ids for invocation agents, steps, `needs`, and synthesis refs must match:

```text
^[a-z][a-z0-9-]{0,62}$
```

This prevents path traversal, blank headings, and prompt temp-file ambiguity. `agent-team-synthesizer` is additionally reserved for the default synthesis agent and cannot be used as an invocation-local id. Library bindings use source-qualified refs such as `package:reviewer`. Step `agent` and synthesis `agent` accept either an invocation-local agent id or a source-qualified library ref. Bare library names are not resolved.

## Catalog action

`action: "catalog"` is the model-facing discovery/search surface. It returns reusable library agents from selected sources, filtered by `library.query` when provided. Query matching is case-insensitive substring filtering over catalog metadata: name, source-qualified ref, description, source, tools, model, and file path. It does not search the full agent prompt body, so role names or refs are the safest queries.

Default library behavior:

- sources: `package`, `user`
- project agents: `deny`

Library source resolution is explicit:

| Source | Owner and path | Activation |
| --- | --- | --- |
| `package` | Bundled package prompts from installed/source `agents/*.md`. | Enabled by default and addressed as `package:name`. |
| `user` | Personal prompts from `${PI_CODING_AGENT_DIR}/agents/*.md`, or `~/.pi/agent/agents/*.md` when the environment variable is unset. | Enabled by default and addressed as `user:name`; denied if the directory resolves inside the current project root. |
| `project` | Repository prompts from the nearest ancestor project `.pi/agents/*.md`; the global Pi config root `~/.pi` is ignored as a project marker. | Disabled by default and addressed as `project:name`; requires `library.sources` plus `projectAgents` approval/allowance. |

Catalog rejects run-only fields (`objective`, `graphFile`, `agents`, `steps`, `synthesis`, `limits`) instead of silently ignoring them. `library.query` is catalog-only; run calls reject it because query filtering does not scope execution. Runtime validation failures render as `# agent_team error` with diagnostics and no normal catalog/run body.

Catalog output includes each agent's source-qualified ref, declared tools, thinking level, optional model, description, file path, and SHA-256 prefix. It reports active discovery sources, not denied requested sources, and renders `none` when no source is active. Structured details include the full SHA-256. This lets the caller distinguish package/user/project prompts, choose the right role, and cite provenance. Duplicate frontmatter names across sources are allowed because `package:reviewer`, `user:reviewer`, and `project:reviewer` are different refs.

## Run action

`action: "run"` requires:

- `objective`
- `steps`

`agents` is optional. If omitted, steps may directly reference source-qualified library agent refs. Inline agents are first-class and should be preferred when the caller needs task-specific specialists.

### Agent specs

One invocation-local agent object supports both inline agents and library bindings:

```ts
{
  id: string,
  kind: "inline" | "library",
  ref?: string,
  description?: string,
  system?: string,
  tools?: string[],
  model?: string,
  thinking?: "inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
  cwd?: string,
  outputContract?: string
}
```

Inline agents require `system` and cannot set `ref`. Library bindings require `ref`, and `ref` must be source-qualified, for example `package:reviewer`. Library bindings may override `tools`, `model`, `thinking`, `cwd`, and `outputContract` for this invocation only; `system` is denied on library bindings so library prompt provenance is not silently replaced or ignored. Steps may also directly use `agent: "package:reviewer"` without declaring a binding.

Tool semantics fail closed:

- inline `tools` omitted: launch with `--no-tools`
- library `tools` omitted: use the library agent's declared tools, or `--no-tools` if the library file declares none
- invalid invocation override tool names deny the call before launch; invalid library-declared tool names skip that library agent with a diagnostic so unrelated inline/default runs still work
- `tools: []`: launch with `--no-tools`
- `tools: ["read", "grep"]`: launch with exactly that allowlist unless automatic oversized-output handoff needs `read`

Tool names are Pi tool identifiers available to the child process. This package currently allows only `read`, `grep`, `find`, `ls`, `bash`, `edit`, and `write` for isolated children; `bash` executes commands and should be added only when trusted command checks are needed. Unavailable invocation names are validation errors, and unavailable library-declared names skip only that library agent. Child launches pass either `--no-tools` or `--tools ...`; they never inherit an unknown ambient tool envelope. The only automatic augmentation is oversized upstream handoff: when a receiver must dereference a parent-created output artifact, runtime adds `read` to that receiver launch and emits an info diagnostic.

### Steps

Steps form a bounded DAG:

```ts
{
  id: string,
  agent: string,
  task: string,
  needs?: string[],
  cwd?: string,
  outputContract?: string
}
```

Steps without `needs` are launched as soon as dependencies and concurrency permit. Write-capable or side-effectful implementation steps should be serialized with explicit `needs` edges or `limits.concurrency: 1` unless file/effect ownership is disjoint. Steps with `needs` wait for those steps to reach a terminal state. Duplicate `needs` and synthesis `from` refs are de-duplicated in order before runtime handoff. Upstream outputs are appended automatically to the downstream delegated task; the caller does not need placeholder syntax or handoff policy. Every generated child prompt states that upstream, tool, repo, and quoted content are untrusted evidence, not instructions. Tasks with upstream output also wrap that output in an untrusted-evidence boundary before and after the formatted output. Runtime copies each upstream step's assistant output inline when it is at most 100000 characters. Larger assistant output is persisted to a mode `0600` temp file, the exact JSON-string file path is passed to the receiver, and the receiver launch is augmented with `read` so the artifact can be dereferenced. If oversized output cannot be persisted, the producing step fails. If a persisted artifact later becomes unreadable, the receiver is blocked before launch.

`cwd` must resolve to an existing directory. Child Pi still receives that `cwd`, but `--no-extensions` prevents the delegated directory from auto-loading `.pi/extensions` or `.pi/settings.json` package code, `--no-context-files` prevents repo `AGENTS.md`/`CLAUDE.md` prompt injection, `--no-skills --no-prompt-templates --no-themes` suppress user/project resource injection, and the empty `--system-prompt` source suppresses project `SYSTEM.md` discovery. If the child has `bash` enabled and the resolved `cwd` is inside a tree containing any `.pi/settings.json` filesystem node, the step is refused before launch because project settings can alter shell execution.

If a dependency fails, aborts, times out, or is blocked, downstream steps are blocked unless the step is synthesis with `allowPartial: true`.

### Synthesis

`synthesis` appends a synthetic final step:

```ts
{
  id?: string,
  agent?: string,
  from?: string[],
  task: string,
  allowPartial?: boolean,
  outputContract?: string
}
```

If `agent` is omitted, the runtime creates an inline `agent-team-synthesizer` for that invocation. The default synthesizer is created only when a `synthesis` block exists. It receives inline upstream output up to 100000 characters per referenced step; when a referenced step is larger, runtime passes file refs and augments the synthesizer launch with `read`. Synthesis is terminal fan-in: normal steps cannot depend on the synthesis step. For final triage over independent review lanes, set `allowPartial: true` so a failed/timed-out lane does not block recovery synthesis.

## Trust boundary

The canonical trust boundary for repository-controlled agent prompts is `prepareLibraryOptions()` in `extensions/multiagent/src/library-policy.ts` and discovery enforcement in `extensions/multiagent/src/agents.ts`.

Policy:

- `projectAgents: "deny"`: do not load project agents.
- `projectAgents: "confirm"`: ask through UI if available, emit an approval/denial diagnostic, skip confirmation when the request fails shape preflight, and fail closed without UI.
- `projectAgents: "allow"`: load project agents. The caller must only use this for trusted repositories.

Project prompt loading also fails closed for:

- symlinked project `.pi` directories
- symlinked `.pi/agents/*.md` entries
- user-agent file symlinks, because they can point back into project-controlled prompts
- user-agent directories lexically or physically contained under the nearest project root discovered from project `.pi`, `.git`, or the prepared project-agent path, including marker files, directories, and symlinks; the global Pi config root `~/.pi` is not a project marker
- real paths resolving outside the project `.pi/agents` directory
- duplicate source refs within one loaded source

Package, user, and project agents are addressed by source-qualified refs, so agents with the same frontmatter name remain distinct across sources. A user-agent directory scoped under the project `.pi` tree or another detected project root is treated as project-controlled and denied through the user source. User-source symlink files are denied rather than resolved as trusted user prompts.

Inline agents are authored by the calling model in the current tool call and do not cross the project-prompt trust boundary.

Subprocess Pi extension/package, context-file, skill, prompt-template, theme, and system-prompt loading are separate trust boundaries. Every delegated child launch includes `--no-extensions --no-context-files --no-skills --no-prompt-templates --no-themes --system-prompt ""`, so untrusted target repositories cannot execute `.pi/extensions`, load project `.pi/settings.json` packages, inject `AGENTS.md`/`CLAUDE.md`, inject `SYSTEM.md`, or load project/user Pi resources merely because a step uses their `cwd`. The caller must include required repo instructions/context explicitly in delegated tasks. Child Pi processes inherit the parent OS process environment needed to run Pi and provider clients; `agent_team` does not scrub environment variables or credentials. The launcher reuses the current Pi executable/script only when both launcher paths are outside delegated denied roots; fallback resolution accepts only an executable absolute `pi` path from absolute `PATH` entries and skips candidates inside the delegated project root, including roots marked by `.git`/`.pi` files, directories, or symlinks. Bash-enabled children add a stricter preflight: any lexical or realpath ancestor `.pi/settings.json` filesystem node blocks the launch because shell execution can still be affected by project settings.

## Lifecycle

Lifecycle object: one step subprocess.

States:

- `pending`
- `running`
- `succeeded`
- `failed`
- `aborted`
- `timed_out`
- `blocked`

Transitions:

- Pending steps become running immediately when dependencies are terminal and integer concurrency is available. The default and hard maximum are 6 concurrent runnable steps.
- Running steps become succeeded only on an explicit zero exit code, no external signal, a valid final assistant `message_end`, `stopReason: "stop"`, no terminal assistant error message, no malformed JSON-mode stdout before terminal stop, no stdin/stdout/stderr transport failure, no oversized-output artifact persistence failure, and no model error.
- Running steps become failed on missing/non-zero exit, external signal, stdin/stdout/stderr transport failure, malformed or oversized JSON-mode stdout before terminal stop, missing or malformed final assistant `message_end`, child-reported final non-success stop reason, terminal assistant error message that child Pi does not recover, model error, oversized-output artifact persistence failure, invalid `cwd`, bash/project-settings refusal, or stderr-backed process launch error. Intermediate `toolUse` turns are allowed only when a later final `stop` arrives. Pi child auto-retry owns retryable assistant errors such as transient provider `terminated` responses: `auto_retry_start` resets transient assistant failure/output state, retry lifecycle events are retained as bounded diagnostics, and the parent does not kill the child before Pi can retry. Compaction events are retained as bounded lifecycle diagnostics/events only; they do not decide terminal step state. Irrecoverable protocol failures and stream transport errors terminate the child promptly instead of waiting for a timeout; the original transport/protocol cause remains the terminal error even if termination adds a signal, timeout, missing-exit closeout, or process `error` during shutdown. Once a terminal `stop` is latched, late child JSON and non-JSON stdout frames, including oversized coalesced tails, are ignored and surfaced through a diagnostic instead of mutating final output; post-terminal lifecycle events such as `auto_retry_end` may still be recorded. Failed and blocked results include `failureCause` and `failureProvenance`: the first observed failing condition, whether parent closeout terminated after that failure, closeout facts, and likely root classification.
- Running steps become aborted when the parent Pi abort signal fires.
- Running steps become timed_out when `limits.timeoutSecondsPerStep` expires. There is no default timeout; broad review, implementation, untrusted, or tool-using graphs should set one.
- Pending steps become blocked when required dependencies fail or no runnable graph order remains.

Abort behavior checks cancellation before prompt materialization and again before subprocess spawn; once spawned, abort, timeout, and irrecoverable protocol/stream failure termination send `SIGTERM` then `SIGKILL` after five seconds if needed, wait briefly for close confirmation after escalation, preserve observed close signals in failure provenance, and report unconfirmed termination as both a diagnostic and `closeout=unconfirmed_after_sigkill` in the model-facing result. Process errors during shutdown are appended as diagnostics without replacing the first observed failure cause. Temporary prompt files are mode `0600`, use an opaque `system.md` filename instead of a model-controlled id, and are removed after the subprocess exits or prompt write fails, with cleanup failures reported before the final step snapshot.

The scheduler is dynamic: when a step completes, newly unblocked dependents launch immediately if concurrency permits rather than waiting for the rest of the ready batch.

## Output behavior

The final tool output is written for the calling model:

- catalog results for `catalog`
- objective, final synthesis when present, step summary, step outputs, and diagnostics for `run`

Structured details include public resolved-agent summaries, catalog entries, per-step results, diagnostics, usage, model, bounded events, raw stderr preview, assistant-output disposition/path, structured failure cause/provenance, and diagnostic JSON paths when validation can identify the offending field. Parent diagnostics and malformed stdout evidence are stored as events instead of being mixed into raw stderr. Resolved-agent system prompts are omitted from public details.

Per-step assistant output has one owner: `assistantOutput`. It stores inline text up to 100000 characters. When output exceeds that threshold, runtime writes the already-buffered text plus subsequent deltas to a mode `0600` temp artifact, clears inline text, and exposes the exact file path in `assistantOutput.filePath`. There are no parallel `output`, `outputFull`, or per-step `fullOutputPath` fields.

Synthesis and dependent steps receive assistant output inline up to 100000 characters per upstream step. Larger upstream outputs are represented by exact JSON-string temp-file paths so whitespace in temp roots is not compacted, and the copied child output block is left empty. The receiver launch gets `read` automatically when an oversized upstream artifact is needed. A receiver is blocked if an oversized upstream output artifact becomes unreadable. If the aggregate final result exceeds 2000 lines or 50KB, the aggregate is written to `AgentTeamDetails.fullOutputPath` when possible.

Resource caps are part of the public contract: graph files are bounded at 256 KiB, child JSON stdout lines are bounded at 1000000 characters, inline upstream handoff is 100000 characters per upstream step, model-facing aggregate output is capped at 2000 lines or 50KB before full-output spill, per-step retained events are capped at 40 entries with an `events-truncated` marker, per-event previews are capped at 2000 characters including marker text, stderr previews are capped, and caller text fields have schema max lengths. Text decoding uses streaming UTF-8 decoders so split multibyte characters are not corrupted.

Subagent stdout, raw stderr, malformed stdout diagnostics, model text, tool previews, catalog metadata, output files, and failure fields are captured evidence for the current parent conversation. Structured details and artifacts preserve captured evidence as observed except for file spill, bounded previews, and aggregate truncation. Model-facing output blocks escape delimiter-like line starts; inline summaries and metadata lines compact whitespace for display. Failed and blocked steps render the terminal reason, first observed cause, and structured failure provenance even when partial assistant output exists; upstream handoffs include those failure facts outside copied or omitted output. Oversized-output handoffs place the exact artifact path as parent metadata and leave the copied child output block empty. For caller-agent triage, model-facing provenance orders JSON-stringed `likely_root`, `first_observed`, `closeout`, and `failure_terminated` before lower-priority process facts; child-controlled assistant error text cannot reclassify a trusted parent/process failure prefix.

Temp assistant-output and aggregate files are retained because they are evidence artifacts for the caller. The caller owns cleanup after use. Mode `0600` temp files protect against other users, not against same-UID processes or untrusted children with filesystem-capable tools such as `read`, `grep`, `find`, `ls`, or `bash`. Automatic oversized-output handoff adds `read` to the receiver, so it is a prompt-level handoff control, not an OS sandbox. Temp-file write failures remove the just-created temp directory when possible while preserving the original write failure. Assistant-output artifact write failures fail the producing step; aggregate-output write failures are reported as parent diagnostics while preserving bounded model output and completed step evidence.

## Recoverability posture

Lifecycle object: one `agent_team` graph run owned by the parent Pi tool call.

Current durability contract:

- In-memory scheduler state is authoritative only while the parent tool call is alive.
- Completed step outputs returned in the final tool result remain valid evidence when later steps fail, time out, or are terminated.
- The graph is not atomic. Side effects performed by child tools are real workspace changes, not a transaction that `agent_team` can roll back.
- Parent-process crash before final result loses the scheduler ledger. Per-step temp files may exist, but there is no durable index proving which steps were sent, acknowledged, completed, or unsafe to retry.
- Retrying a failed or interrupted side-effectful step is a new execution and must start from live workspace inspection. Do not blindly replay a body that may have already edited files or invoked external effects.
- Long review, implementation, untrusted, or tool-using graphs should set `limits.timeoutSecondsPerStep`; without it, a stalled child can hold the parent call open until parent abort or external termination.

Future durable resume requires a mode-`0600` run ledger with run id, objective hash/preview, step ids and statuses, child pids while running, cwd, agent refs, prompt/task artifact hashes or paths, stdout/stderr/output artifact paths, transition timestamps, terminal reasons, and replay-safety classification.

## Test and provenance gates

Canonical local gates:

```bash
pnpm test
pnpm run smoke:pi
pnpm run check:pack
pnpm run check:pi-load
pnpm run check:public-docs
pnpm run check:source-size
# or all local gates:
pnpm run gate
```

`smoke:pi` imports the registered extension entrypoint through a local peer-dependency loader, asserts `agent_team` registration/execute wiring for catalog, validation-error, and project-confirmation paths, and executes a fake-spawn run contract for child launch shape and stdin task transport. `check:pi-load` reads `package.json`, imports the declared Pi extension paths through the same peer-dependency loader, and asserts the loaded extension registers and executes `agent_team`. Unit tests include graph-cookbook example validation so `examples/graphs/*.json` remains parseable and resolvable against bundled package agents. `check:pack` runs `npm pack --dry-run --json` and asserts the packed artifact includes `AGENTS.md`, `VISION.md`, `LICENSE`, docs, examples, the package-owned skill and references, every bundled package agent, package manifest, and every extension TypeScript source file while excluding tests, smoke scripts, runtime state, `CONTINUE.md`, `PLAN.md`, and `HANDOFF.md`. `check:public-docs` rejects machine-local public copy, stale pinned GitHub install tags, broken relative Markdown links, missing public-contract invariants, and static package-agent catalog tables that should come from runtime catalog output.
