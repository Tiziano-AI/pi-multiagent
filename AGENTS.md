# AGENTS.md — pi-multiagent

`pi-multiagent` is a Pi package that registers the detached `agent_team` tool and the `/skill:pi-multiagent` skill, so a parent Pi agent can launch graphs of child Pi sessions and supervise them. It is published on npm as `pi-multiagent` from `github.com/Tiziano-AI/pi-multiagent`, accepts outside contributions, and has real users who have written graphs and integrations against the public `agent_team` contract. Compatibility is owed to them: [CONTRIBUTING.md](CONTRIBUTING.md) requires every change to preserve the current public contract unless an accepted proposal changes it. Change that contract only through that proposal process and a new version whose `CHANGELOG.md` entry says what breaks and how to migrate, never through a compatibility shim or an alias such as `action:"run"`. Add no broad hardcoded machinery, and no new bundled agent role without a distinct trigger, tool profile and tests.

## Where things live

Source, under `extensions/multiagent/`:

- `index.ts` registers the tool with the Pi host and owns session and UI callbacks. Keep it thin and put behavior in the nearest module under `src/`; `pnpm run check:source-size` fails any `.ts` file under `extensions/` above 500 lines or 18 KiB (the budget is in `tests/package-policy.ts`).
- `src/delegation.ts` dispatches the public actions.
- `src/schemas.ts` owns the public tool and graph shape; `planning.ts`, `authority-policy.ts` and `tool-policy.ts` own preflight admission; `detached-run.ts` with the `rpc-child-*` and `rpc-session-state.ts` modules own execution and child lifecycle; the snapshot, result, rendering and artifact modules own readback. When one of these contracts changes, update its dependent tests, docs and examples in the same change.

Documentation, each file with one job; do not copy the full contract from one into another:

- `README.md` is the human and operator front door.
- `skills/pi-multiagent/SKILL.md` is the canonical model-facing contract: actions, schema, authority, child runtime, supervision, limits and troubleshooting.
- `skills/pi-multiagent/references/graph-cookbook.md` owns graph choreography.
- `examples/graphs/*.json` are pure, schema-valid graph bodies.
- `CONTRIBUTING.md` owns the proposal, PR, changelog and validation rules for source changes.
- `CHANGELOG.md` holds the release notes; the rule for its `## Unreleased` section is under "Releasing".
- `AGENTS.md` (this file) is tracked guidance for agents working on the repository. The `package.json` `files` allowlist keeps it out of npm.

`pnpm run check:public-docs` enforces these boundaries and fails if a root `ARCH.md`, `TODO.md` or `VISION.md` exists, so planning notes stay in the local files below.

## Local files

The maintainer keeps working material in local files that `.gitignore` (or `.git/info/exclude`) keeps out of Git and the `files` allowlist keeps out of npm. Public clones do not have them. When they exist, read `MAINTAINER.md` first, and `PLAN.md` and `action_plan.md` before changing lifecycle code:

- `MAINTAINER.md` holds the maintainer's release runbook and the facts about the maintainer's own checkout: how the maintainer's Pi loads it and what uncommitted work it carries.
- `PLAN.md` holds the plan for the lifecycle repair described below and the record of earlier passes.
- `HANDOFF.md` holds handoffs and release records.
- `action_plan.md` is the 1.0 rewrite plan described below.
- `meta_study.md` is the saved prompt for product meta-analysis and improvement passes.
- `wip.md` and `Proposal for issue #1.md` are issue-analysis notes, excluded through `.git/info/exclude`.
- `.cdx-continue/` is continuation state that a maintainer's Codex tooling may write; the directory ignores itself through its own `.gitignore`.

A proposal in any of these files is evidence for a decision, not authority to implement it. `pnpm run check:pack` fails if `AGENTS.md`, `MAINTAINER.md`, `PLAN.md`, `HANDOFF.md`, `action_plan.md` or `meta_study.md` is packed, and `.npmignore` is a defensive backup to the `files` allowlist.

## Direction and open work

These are the maintainer's standing decisions and the open questions that the next piece of work has to start from.

**1.0 is the intended direction, but not the current work.** `action_plan.md` describes a clean `1.0.0` rewrite from `origin/main`: one lifecycle reducer, no child capability beyond what the parent has, explicitly named skills and extensions, and a strict per-action schema. It deliberately breaks 0.x graphs and integrations and lists the losses it accepts. The maintainer favors it but has not scheduled it, so do not start it, copy code toward it or treat the plan as approved until the maintainer approves it under the CONTRIBUTING.md proposal process.

**Retarget the 1.0 plan before anyone approves it.** The plan pins exactly Pi `0.84.1` and rejects every other Pi version. Pi ships several releases a month and many installs upgrade Pi on their own, so an exact pin would make the package refuse to load most of the time, including on the maintainer's own machine. Rewrite the plan to target a minimum supported Pi version, expressed as a peer-dependency floor and validated against the Pi that is current when implementation starts. Revalidate its other Pi assumptions at the same time.

**Users of 0.9.8 have a child-completion defect.** Released `0.9.8` closes a child when Pi emits `agent_end` (`src/rpc-child-controller.ts`). `agent_end` is preliminary: Pi can still retry, compact or run queued follow-up work after it. In an observed Pi 0.81 incident, a child finished a valid compaction and its step stayed alive until the outer timeout; progress notices also started parent turns that ran into the context limit, queue updates that arrived before the command acknowledgement were missed, and child usage was reported nowhere. The defect was identified from the code and that incident and has not been reproduced on newer Pi.

**A lifecycle repair exists but is unreleased.** It is uncommitted work in the maintainer's checkout (`MAINTAINER.md` says what it holds), not yet in `main`, so the floors and the `src/rpc-child-settlement.ts` module named below are not in a public clone. It is planned as `0.10.0`: the public contract is unchanged apart from higher Node and Pi floors. Its runtime contracts are:

- Runtime floors are Node.js `>=22.19.0` and Pi `>=0.81.0`, the Pi version the repair was written against.
- A child's `agent_end` is preliminary. Normal closeout belongs to `agent_settled` followed by a Pi `get_state` readback showing no streaming and no compaction.
- For parent messages, transport acceptance, queue presence or removal, a matching child user turn, semantic compliance and inclusion in the final output are different facts. Code, copy and tests keep them apart and never report one as another; a message is reserved before transport so that a queue update arriving before the acknowledgement still binds to it.
- The progress watchdog fails a step as `progress-watchdog-timeout` after bounded no-progress outside an observed compaction or running tool, and nonterminal milestone notices are display-only and never start a parent turn.
- Child usage on run and step surfaces is cumulative child-session billed usage, including successful top-level compaction usage. Never attach it to the usage of the parent `agent_team` tool result, because each repeated `run_status` or `step_result` would bill the parent again, and never present it as current context occupancy. The 1.0 plan instead makes one terminal Pi session-stats snapshot the usage owner; do not combine the two accounting paths.

One repair contract is unresolved: settlement with a non-empty pending-message queue. On the settlement path, which spans `src/rpc-child-settlement.ts` and `src/rpc-child-controller.ts`, a child closes out normally after the idle readback even when `pendingMessageCount` is positive, and the settlement module emits an `agent_settled_pending_messages` diagnostic instead of deferring. The skill promises an empty queue and says an extension-queued follow-up keeps the child live, and README, the CHANGELOG Unreleased notes and `PLAN.md` also describe queue-idle settlement, so operators may expect a queued continuation that closeout does not wait for. Whether Pi actually loses such a continuation has not been observed. Pi 0.87.0 added an `agent_before_settle` event and defers runs requested from `agent_settled` handlers, which bears directly on this question. Establish the target Pi's real settlement and pending-queue behavior, including extension-queued continuation, then choose the contract explicitly and align source and docs to it; the diagnostic's explanation in source is not an observation of Pi.

Finishing the repair against the current Pi and releasing it as `0.10.0`, with 1.0 kept for later, would fix the defect for existing users without breaking their graphs. That is the recommendation on record; the choice between finishing it now and waiting belongs to the maintainer. The repair and 1.0 must not be mixed: 1.0 starts from a clean `origin/main` lineage and uses the repair only as evidence of the defects.

**Outside contributions are waiting for a maintainer reply.** PR #16 fixes the gate tests for npm's `--json` output format change; PR #17 and proposal #15 add child team cost to `run_status` and the footer, which the repair's usage accounting also addresses; proposal #18 suggests an agent overlay library. None has a maintainer response. Proposals #6, #7 and #8 were answered and parked in the backlog. Replying, reviewing on GitHub and merging are the maintainer's to do; an agent may prepare a draft reply or review but does not post it.

## Running it in Pi

Pi can load this package from npm (`pi install npm:pi-multiagent`) or from a checkout path listed in Pi's settings. When Pi loads a checkout, `/reload` exercises that working tree, uncommitted edits included; do not also install the npm package in that setup, because the second copy creates skill and extension conflicts. `MAINTAINER.md` says how the maintainer's own Pi is set up.

Passing tests on the checkout do not show what Pi has loaded. To see this code in Pi, `/reload`, then check `pi list`, that `/skill:pi-multiagent` is available, and `agent_team catalog`. After a release, the npm metadata and tarball, the GitHub tag and release, and the public assets are each checked separately.

`/reload` is not passive: session shutdown requests cancellation of the live runs that session owns, so preserve the evidence you need first. After `start` returns a `runId`, parent abort or Escape does not stop detached work; use `agent_team cancel`. Run handles and registries are local to the process and session, and persisted child Pi sessions and retained artifacts are audit evidence, not handles for crash resume or reattachment. Read the skill's "Supervision and evidence" section before stopping, reloading, or investigating a missing run.

## Validating a change

Install development dependencies with `pnpm install`; `packageManager` in `package.json` pins pnpm 11.1.2. `pnpm-lock.yaml` is gitignored and not tracked, so a fresh clone or worktree resolves dependencies from the `package.json` ranges.

Run focused tests first, for example:

```bash
node --import ./tests/node-test-ref-timers.mjs --no-warnings --experimental-strip-types --loader ./tests/pi-peer-loader.mjs --test tests/rpc-jsonl.test.ts
```

Then run `pnpm run gate` (typecheck, all tests, fake-Pi smoke, pack, Pi load, public-docs and source-size checks) and `git diff --check`. CONTRIBUTING.md lists the validation a PR must report.

`pnpm run check:release` is for maintainer release readiness, not development. Its offline half, `check:release:offline`, requires a clean tree, `HEAD:package.json` at the working version, an empty `## Unreleased` and a dated changelog section for that version; its network half, `check:release:npm`, requires that version to be unpublished on npm. Defer it while the tree is dirty.

## Releasing

Releases are maintainer work. The step-by-step runbook (inspection, version choice, checks and dry runs, commit, tag and push, `npm publish`, the GitHub Release and the public read-back) is `MAINTAINER.md`. A checkout without it carries no release authority: do not tag, push release tags, publish or create GitHub Releases from it.

`examples/graphs/release-readiness-review.json` forbids source and release edits but is not read-only on disk: it grants shell authority and runs `pnpm run gate`, whose `check:pi-load` packs into a temporary directory, and its child Pi sessions persist as usual. Inspect the graph and the current scripts, and get authority for those effects before launching it. No mutation-capable release-fix graph ships in `examples/graphs/`; use one only when that exact graph exists in the current checkout and the operator explicitly authorizes its fix scope. Do not run `npm publish`, git commit, tag or push, or GitHub Release creation from any delegated graph; a graph may report publication, tag and push, GitHub Release creation and `gh release view` verification only as human-owned next actions it did not execute.

Source state rules for every change:

- During normal development, `CHANGELOG.md` `## Unreleased` must describe the current unreleased source delta. It may be empty only when the tree has no unreleased product change, or after final release prep has moved the notes into the dated release section.
- Before calling a release ready, compare the current diff and package contents with `CHANGELOG.md`. If runtime, docs, examples, tests, package metadata or release choreography changed and `Unreleased` does not say so, the changelog is stale and the release is blocked.
- The `package.json` version names the candidate being prepared, not necessarily what has shipped. If `npm view pi-multiagent versions --json` already lists it, choose and set a new version before any publish attempt.
