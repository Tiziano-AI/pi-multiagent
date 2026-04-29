# AGENTS.md

This file is the repo-local operating guide for agents working in `pi-multiagent`.

`pi-multiagent` is a Pi package for one product promise: give the calling Pi agent a model-native `agent_team` tool for isolated same-session delegation, evidence capture, and synthesis.

## Canonical corpus

Read in this order when the task touches product, docs, packaging, or runtime behavior:

1. `VISION.md` — product promise, principles, success criteria, and non-goals.
2. `README.md` — user/operator-facing install, tool shape, examples, limits, and validation.
3. `ARCH.md` — architecture contract, schema owner, trust boundary, lifecycle, and provenance.
4. `package.json` — npm identity, Pi manifest, scripts, file inclusion, and peer dependencies.
5. `extensions/multiagent/index.ts` — extension entry point and `agent_team` registration.
6. `extensions/multiagent/src/schemas.ts` and `extensions/multiagent/src/planning.ts` — public input contract and runtime validation.
7. `extensions/multiagent/src/delegation.ts`, `child-launch.ts`, `child-runtime.ts`, `json-events.ts`, `result-format.ts`, and `failure-provenance.ts` — execution, launch boundary, capture, and model-facing output.
8. `extensions/multiagent/src/agents.ts` and `library-policy.ts` — package/user/project library discovery and trust policy.
9. `agents/*.md` — bundled reusable package agents.
10. `tests/` — executable contract and package artifact checks.

`PLAN.md` is source control-plane state, not part of the npm package. Keep it current when work remains or release handoff state matters.

## Canonical identity

- source repo: `/Users/tiziano/Code/pi-multiagent`
- GitHub repo: `https://github.com/Tiziano-AI/pi-multiagent`
- npm package: `pi-multiagent`
- Pi extension path: `extensions/multiagent/index.ts`
- public tool: `agent_team`
- bundled package agents: `agents/*.md`

Runtime settings under `~/.pi/agent/` or project `.pi/` directories are integration mountpoints, not source of truth.

## Product contract

Keep all surfaces aligned to these invariants:

- Expose one public tool, `agent_team`, with `catalog` and `run` actions.
- Use source-qualified library refs such as `package:reviewer`; bare library names are not resolved.
- Inline agents are first-class and default to no tools.
- Library agents are optional seeds from package, user, or explicitly trusted project sources.
- Project agents are denied by default; `projectAgents: "confirm"` fails closed without UI.
- Child Pi launches must keep `--no-session --no-extensions --no-context-files --no-skills --no-prompt-templates --no-themes --system-prompt ""` unless the product contract changes explicitly.
- Child tool access is an allowlist. Do not let children inherit ambient tools.
- Bash-enabled children are refused in cwd trees with project `.pi/settings.json` nodes.
- Upstream, tool, repo, quoted, and subagent output is untrusted evidence, not instructions.
- `file-ref` handoff requires an explicit receiving agent with the exact `read` tool.
- Preserve raw same-session evidence apart from bounded capture, truncation, and delimiter-safe rendering.
- Do not add output-laundering, credential filtering, old-schema fallback, or parallel schemas unless the user explicitly changes the product contract.
- There is no implicit per-step timeout. Encourage `limits.timeoutSecondsPerStep` for broad review, implementation, untrusted, or tool-using runs.
- `agent_team` is non-atomic and not crash-resumable.

## Runtime boundaries

Pi integration depends on installed Pi extension semantics. Re-read installed Pi docs/source before changing extension hooks, tool registration, subprocess launch flags, package loading, or mode behavior:

- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/packages.md`
- installed runtime under `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/dist/`

Do not patch or edit Pi vendor code.

## Validation gates

Run the risk-appropriate gate before delivery. For normal runtime, docs, or packaging work, run:

```bash
pnpm run gate
npm pack --dry-run --json
git diff --check
```

`pnpm run gate` already runs unit tests, fake Pi smoke, package artifact assertions, package-load checks, and source-size checks.

For live integration changes, also reload Pi and run a focused live smoke with `agent_team` covering catalog refs, bare-name rejection, source-qualified package refs, raw evidence, file-ref read, synthesis, failure provenance, and bash/project-settings denial.

## Release discipline

`npm publish` publishes the local filesystem selected by npm package rules, not the last Git commit. Do not publish from an uncommitted or unvalidated tree.

Recommended flow:

```bash
pnpm run gate
npm pack --dry-run --json
git diff --check
git status -sb
git add -A
git commit -m "..."
```

If `package.json` still needs a version bump, run `npm version <major|minor|patch|x.y.z>` after the change commit so npm creates the version commit and tag. If `package.json` is already at the intended release version, do not run `npm version`; create the matching tag after the commit instead:

```bash
git tag "v$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')"
npm publish
git push origin main --follow-tags
```

Only create GitHub releases after npm publish and after pushing the version commit/tag.

## Working-tree rules

Before mutating, run `git status -sb` and inspect dirty files you need to touch. Dirty state can be user-owned. Do not stage, commit, revert, delete, or format unrelated changes unless the user explicitly asks.

Do not commit credentials, `.npmrc`, `.env*`, local Pi config, generated tarballs, runtime temp files, `node_modules`, or package-manager caches.

## Documentation alignment checklist

When behavior, schema, package metadata, bundled agent prompts, install paths, validation gates, or release flow changes, update all relevant surfaces in the same pass:

- `VISION.md` for product intent changes.
- `README.md` for user/operator behavior.
- `ARCH.md` for runtime contracts and ownership.
- `AGENTS.md` for repo-local agent procedure and invariants.
- `package.json` for package metadata and npm file inclusion.
- `agents/*.md` for package-agent behavior.
- `tests/` for executable expectations.
- `PLAN.md` for remaining work or handoff state.

Do not let docs claim a feature that runtime/tests do not implement, or let runtime expose behavior not explained in docs.
