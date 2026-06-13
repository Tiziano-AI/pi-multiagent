# Changelog

## Unreleased

- Increased the `agent_team` graph concurrency maximum from 6 to 10 while keeping the default at 6.

## 0.9.6 - 2026-05-29

- Added public contributor guidance, GitHub PR/issue templates, and README contribution workflow notes for design-gated architecture changes, scoped PRs, release ownership, and validation expectations.
- Unref spawned child process handles so print-mode parent processes are not kept alive after terminal output.
- Contracted `start` preflight repair copy to suggest moving only current graph body fields (`objective`, `steps`, `limits`, `authority`) under `graph`; unsupported extra properties now fall through to strict schema validation.
- Fixed fake-Pi smoke notice assertions so documented terminal artifact paths are allowed when temporary directories contain `/tmp`.

## 0.9.5 - 2026-05-25

- Removed `agent_team` live run/lane counts from Pi's shared footer status row; live progress remains in the `agent_team:live` widget and pushed notices.

## 0.9.4 - 2026-05-24

- Added a complete `/skill:pi-multiagent` first-success `graphFile` recipe and separated tool-call actions from `graph.steps[]` object shape so `step` is not presented as an `agent_team` action.

## 0.9.3 - 2026-05-24

- Removed the separate local-source trust authority from schemas, planning, catalog prep, extension-tool grants, caller-skill propagation, docs, and tests; project/user sources now load when selected or product-enabled, while explicit extension-tool grants still require `allowExtensionCode:true`.
- Made package role capability truth fail closed: `package:validator` now requires effective `bash`, and `package:worker` now requires effective `edit` or `write` instead of silently running misleading capped roles.
- Removed source and file-path provenance from catalog query scoring while keeping provenance rendered in catalog rows; routing now scores role names/ref names, descriptions, tags, default tools, model, and thinking.
- Simplified first-success and headless supervision guidance, including `run_status {runId, waitSeconds}` fallback copy, cursor semantics, conditional step-result hints, and stronger cleanup-as-evidence-deletion warnings.
- Added source-grounded product-experience, tree-reduce, and evidence-trace graph examples plus cookbook guidance for advanced read-only audit choreography.

## 0.9.2 - 2026-05-24

- Removed non-enforced shell and mutation paperwork from graph schemas, planning, prompts, final artifacts, docs, examples, agents, and tests.
- Reframed shell and mutation guidance around real coarse tool grants: trusted shell execution, trusted mutation execution, explicit task text, owned files, exclusions, validation commands, cwd launch checks, and graphFile validation.
- Contracted packaged graph examples and public-doc checks to positive current behavior, keeping read-only, command-validation, release-readiness, and research-to-change shapes as the maintained examples.

## 0.9.1 - 2026-05-24

- Marked package-returned `agent_team` `ok:false` results as Pi tool-result errors through the supported `tool_result` hook, while keeping successful receipts non-error.
- Preserved child `tool_execution_end.isError` as debug-visible error-status tool activity and compact `lastActivity` without failing steps that later recover.
- Added bounded `Non-final assistant evidence` to failed/canceled/timed-out step artifacts when no successful final exists, and expanded final artifact metadata with launch-time tools, extension tools, model/thinking lane, cwd, and upstream artifact references.
- Added focused regression tests and public docs for error observability, recovered child tool errors, non-final artifact evidence, and detached ESC/cancel semantics.

## 0.9.0 - 2026-05-22

- Tightened `agent_team` supervision contracts: fire-and-forget child UI updates now render as suppressed non-error activity, `run_status(waitSeconds)` returns a structured wait receipt without waking on routine activity, and message/follow_up acceptance is explicit accepted-for-delivery transport proof rather than child compliance or completion proof.
- Made `package:web-researcher` fail closed during graph planning unless explicit callable `exa_search` and `exa_fetch` `extensionTools` are granted with extension authority, while keeping the role prompt's `BLOCKED` branch as defense-in-depth.
- Updated README, `/skill:pi-multiagent`, cookbook guidance, model-facing tool registration copy, public-doc/package-load checks, and focused tests for the new supervision and web-capability contracts.

## 0.8.7 - 2026-05-21

- Replaced model-facing detached-run identifiers with short process-local, session-owned `runId` handles such as `r1`, including schema validation, start output, repair copy, live widget/status scoping, same-session notice delivery, capacity-denial redaction, docs, examples, rendering expectations, and focused runtime tests.

## 0.8.6 - 2026-05-21

- Added richer terminal artifact metadata: finalized step artifacts now include full task text, cwd, dependency edges, upstream artifact references, and stop/status hints, while `run_status` surfaces bounded task previews plus all terminal step artifacts instead of sinks only.
- Improved repair microcopy for common supervision mistakes, including `run_status` `stepId` plus `preview:true`, live `message` step-not-found recovery, multi-error schema diagnostics, dependency-cycle paths, and clearer TUI message action labels.
- Added `validation-matrix-gate.json` plus cookbook guidance for parent graph packets, artifact handoff packets, partial-evidence recovery, alternative-plan tournaments, and Web Research to Local Decision choreography.
- Tightened catalog role descriptions for local exploration, docs audits, adversarial review, completed review, command validation, and synthesis routing.
- Updated README, skill, examples, public-doc checks, and focused runtime tests around the new metadata and repair contracts while keeping source-size and package checks green.

## 0.8.5 - 2026-05-21

- Added recoverable child-RPC context-overflow handling so Pi compaction/continue can produce a later valid final without accepting stale pre-overflow output, while unrecovered overflow fails and blocks `needs` dependents.
- Exposed launch-time child model/thinking lanes in run snapshots, and clarified that children inherit parent defaults only at `start` time unless agent metadata pins a lane.
- Tightened README, skill, and cookbook guidance around child context isolation, overflow recovery, model-lane evidence, subagent skill propagation, and scoped weak-model tasks.
- Added the `--agent-team-subagent-skills enabled|disabled` product flag; it defaults to enabled/all caller-visible skills, rejects graph-controlled `agent.skills`, and reminds enabled children to use relevant available skills without broadening authority.
- Repaired live child activity status so prompt acceptance, reasoning/tool/message-update RPC activity, and tool events refresh compact run/TUI state without dumping reasoning deltas or fake progress.
- Contracted public-doc and delegation checks toward survivor behavior, active denial, package hygiene, and trust-boundary invariants.

## 0.8.4 - 2026-05-20

- Corrected packaged graph examples so read-only steps omit redundant `agent.tools` overrides and release audit lanes use terminal `after` dependencies to preserve failed or missing proof evidence.
- Improved model-facing repair copy for misplaced top-level graph fields, extension-tool names placed in `agent.tools`, preview/debug `maxBytes` scope, and catalog extension-tool provenance grants.
- Tightened bundled catalog role descriptions and visible routing tags to fit the 12-tag catalog display budget while preserving documented role queries.
- Added cookbook task packet templates for mapper, reducer, validator, and worker outputs.

## 0.8.3 - 2026-05-20

- Fixed child Pi model/provider availability by using normal Pi extension discovery in child launches while keeping explicit `extensionTools` as the provenance-controlled callable extension-tool grant surface.
- Allowed unattended child RPC sessions to ignore fire-and-forget extension UI updates while still failing closed on blocking or unknown UI requests, so ambient extensions such as `pi-continue` can report status during child compaction without terminating the step.

## 0.8.1 - 2026-05-19

- Moved maintainer-only npm publishing choreography out of the public README and into local control-plane instructions, with explicit current-source, changelog, version, clean-commit, tag, publish, GitHub Release, and artifact-verification gates.
- Compressed the public README into a human Pi operator guide for install, trust boundaries, lifecycle, authority, examples, limits, troubleshooting, and source validation.
- Added terminal pushed-notice receipts that expose full sink artifact paths and retention expiry when available while keeping milestone notices compact.
- Added copyable cwd-launched audit, implementation-validation, and sharded map-reduce graph examples, plus cookbook guidance for those patterns and the cookbook-only web-research/local-decision lane.

## 0.8.0 - 2026-05-19

- Replaced the public supervision contract with `run_status` for compact run snapshots and `step_result` for single-step inspection across runtime, schema, docs, examples, and tests.
- Hardened model-facing delegation guidance for package-only default catalog sources, positive catalog routing tags, artifact-first supervision, copy/adapt packets, reducer contracts, and trusted tool-grant handoffs.

## 0.7.2 - 2026-05-19

- Improved detached-run diagnostics for retained-capacity failures, stalled pending steps, retained-run capacity buckets, terminal pushed notices, and compact failed-step reasons.
- Hardened child RPC handling with byte-based JSONL limits, bounded stdin backpressure sends, stdout/stderr error guards, parent-message budget checks, and listener teardown.
- Fixed cleanup result rendering so successful cleanup is receipt-only evidence deletion, denied or failed cleanup remains distinct, and plain notices never point operators back to deleted artifacts.
- Tightened planning and policy copy for mandatory filesystem-read authority, explicit extension-tool trust, and cleanup failure retention.
- Added map-reduce and release-readiness graph examples, with validator steps carrying parent-named trusted proof commands and release lanes preserving human-owned publish and GitHub Release actions as not-executed next steps.
- Clarified graphFile copy/adapt usage, catalog query patterns, missing-scope handling, filesystem-read boundaries, and action selection across docs, skill, cookbook, examples, and tests.
- Tightened release-prep guardrails so `pnpm run check:release` runs only from the clean release commit before tag/push, while npm publish and GitHub Release creation remain human-owned.
- Clarified that ignored local control-plane notes stay local while public-doc and package checks use shipped source, docs, tests, and examples as package truth.

## 0.7.1 - 2026-05-17

- Hardened `agent_team` usability surfaces by exposing effective child tools, reused `clientMessageId` receipts, cleanup-as-evidence-deletion copy, `follow_up` artifact-path guidance, and trusted mutation-tool warnings across runtime snapshots, model/TUI rendering, docs, examples, and tests.
- Added GitHub Release creation and verification to the standard release choreography, package skill, cookbook, and public-doc checks.
- Split deterministic release validation from explicit-approval real Pi smoke guidance.

## 0.7.0 - 2026-05-17

- Replaced foreground `agent_team run` with detached lifecycle actions: `start`, compact `run_status`, `step_result`, `message`, `cancel`, and `cleanup`.
- Moved execution to an RPC-backed detached run manager with compact sink-final indexing, single-step inspection, live step messaging, cancellation, retention cleanup, and pure graph-file ingress.
- Added capped compact milestone/terminal pushed notices, a single live-only low-noise TUI card, debug-only raw events, and tmp final artifacts for every finalized step.
- Made detached background UI/final callbacks compaction-safe by avoiding retained tool-update callbacks and surfacing UI/final callback failures as compact run_status diagnostics plus debug events.
- Hardened detached RPC closeout, max-run expiry, event pagination, JSONL framing, artifact ownership/cleanup, launch-time source verification, and fail-closed planning diagnostics.
- Changed library-agent tool grants to inherit catalog `defaultTools` capped by graph authority, expanded read/discovery primitives into the full `read`/`grep`/`find`/`ls` suite, and split shell authority (`allowShellTools`) from structured mutation authority (`allowMutationTools`).
- Made filesystem read/discovery mandatory for every child step, so `agent.tools:[]` now means mandatory read-only rather than no tools, and `package:synthesizer`/`package:web-researcher` can inspect delegated artifact paths.
- Split shell authority (`allowShellTools`) from structured mutation authority (`allowMutationTools`) and documented the coarse tool grants in schema, runtime planning, and examples.
- Added run_status `waitSeconds` for bounded wait/read snapshots, chronological append-only assistant-final artifacts, clearer compact live-step phase labels, and retention guidance that treats artifacts as durable handoff/context evidence rather than automatic cleanup trash.
- Kept `step_result` step-not-found output compact, made run_status/step_result assistant text opt-in with `preview:false` by default, added run_status hints for non-sink terminal evidence, and strengthened child prompts to require self-contained final answers.
- Added schema-valid all-inline starter guidance so parents can hand-author useful no-catalog graphs without invalid dependency or tool placement.
- Added a shared internal authority-policy matrix and removed latent extension-confirm/caller-skill inheritance branches so start planning keeps explicit include-only skill selection and deny/allow extension-source policy.
- Added graph design ladder guidance, `artifact-chained-decision.json`, and cookbook-only Web Research to Local Decision guidance with exact active catalog provenance requirements.
- Added `package:web-researcher` for explicit extension-tool web research and narrowed `package:scout` to local repo/dependency exploration.
- Sharpened bundled catalog role routing copy for local scout, web researcher, planner, critic, reviewer, docs auditor, validator, worker, and synthesizer boundaries.
- Made catalog search route on non-stopword query terms instead of exact full-phrase-only matches, and tightened package role defaults so read-only Scout/Reviewer no longer inherit `bash` unless a step asks for it explicitly.
- Tightened trust-boundary checks so global Pi settings are not treated as project `.pi/settings.json` launch blockers, repo-local caller-skill sources were classified consistently from subdirectory invocations, and parent messages use escaped JSON payloads instead of delimiter-sensitive raw text.
- Tightened model-facing action/result copy, catalog routing metadata, graph first-success guidance, and implementation example routing without adding new runtime knobs.
- Reworked the interactive live `agent_team` widget, compact tool rows, and pushed notice fallback text into human operator surfaces that prioritize run health, progress, active lanes, queued work, terminal receipts, stop receipts, and attention states without model-facing control guidance.
- Hardened project-root detection, project-agent open-time checks, blank-after-trim planning validation, run-backed error rendering, pushed notice fallbacks, and added an opt-in real Pi smoke target for release-candidate validation.
- Added package release-readiness metadata and human-owned npm publish boundary guidance.
- Updated README, package skill, graph cookbook, examples, catalog tests, package checks, and public-doc checks for the breaking detached-only contract and release guardrails.

## 0.6.2 - 2026-05-07

- Added package-local TypeScript source typechecking to the release gate.
- Refreshed package-local dependencies to their latest pnpm-resolved versions.

## 0.6.1 - 2026-05-07

- Aligned Pi runtime imports, peer dependencies, and package-load tests to the `@earendil-works` Pi 0.74 package scope.
- Added release notes to the packaged npm artifact.
