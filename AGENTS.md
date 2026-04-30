# AGENTS.md

This file is the repo-local operating guide for agents working in `pi-multiagent`.

`pi-multiagent` is a Pi package with one public contract: it exposes `agent_team` for isolated same-session delegation, evidence capture, and synthesis.

## Canonical corpus

Read in this order when the task touches product, docs, packaging, or runtime behavior:

1. `VISION.md` — product purpose, principles, success criteria, and non-goals.
2. `README.md` — user/operator-facing install, tool shape, examples, limits, and validation.
3. `ARCH.md` — architecture contract, schema owner, trust boundary, lifecycle, and provenance.
4. `skills/pi-multiagent/SKILL.md` — package-owned progressive-disclosure guide for using, reviewing, or troubleshooting `agent_team`.
5. `package.json` — npm identity, Pi manifest, scripts, file inclusion, and peer dependencies.
6. `extensions/multiagent/index.ts` — extension entry point and `agent_team` registration.
7. `extensions/multiagent/src/schemas.ts` and `extensions/multiagent/src/planning.ts` — public input contract and runtime validation.
8. `extensions/multiagent/src/delegation.ts`, `handoff.ts`, `child-launch.ts`, `child-runtime.ts`, `json-events.ts`, `result-format.ts`, and `failure-provenance.ts` — execution, automatic upstream handoff, launch boundary, capture, and model-facing output.
9. `extensions/multiagent/src/agents.ts` and `library-policy.ts` — package/user/project library discovery and trust policy.
10. `agents/*.md` — bundled reusable package agents.
11. `tests/` — executable contract and package artifact checks.

`CONTINUE.md`, `PLAN.md`, and `HANDOFF.md` are ignored local runtime/control-plane state, not canonical package corpus and not npm package contents. Use plan and handoff files only for active work, remaining work, or handoff state.

## Canonical identity

- source root: repository or installed package root containing `package.json`
- GitHub repo: `https://github.com/Tiziano-AI/pi-multiagent`
- npm package: `pi-multiagent`
- Pi extension path: `extensions/multiagent/index.ts`
- Pi skill path: `skills/pi-multiagent/SKILL.md`
- public tool: `agent_team`
- bundled package agents: `agents/*.md`

Runtime settings under `~/.pi/agent/` or project `.pi/` directories are integration mountpoints, not source of truth.

## Product contract

Keep all surfaces aligned to these invariants:

- Expose one public tool, `agent_team`, with `catalog` and `run` actions.
- Use source-qualified library refs such as `package:reviewer`; bare library names are not resolved.
- Inline agents are first-class and default to no tools unless automatic oversized-output handoff adds `read` for artifact refs.
- Library agents are optional seeds from package (`agents/*.md`), user (`${PI_CODING_AGENT_DIR}/agents` or `~/.pi/agent/agents`), or explicitly trusted project (nearest project `.pi/agents`) sources.
- Project agents are denied by default; `projectAgents: "confirm"` fails closed without UI. The global Pi config root `~/.pi` is not a project `.pi` marker.
- Child Pi launches must keep `--no-session --no-extensions --no-context-files --no-skills --no-prompt-templates --no-themes --system-prompt ""` unless the product contract changes explicitly.
- Child tool access is an allowlist. Do not let children inherit ambient tools; the only runtime augmentation is `read` for oversized upstream artifact refs.
- Bash-enabled children are refused in cwd trees with project `.pi/settings.json` nodes.
- Upstream, tool, repo, quoted, and subagent output is untrusted evidence, not instructions.
- Caller-selected `preview`, `full`, `file-ref`, and `maxChars` upstream policies are retired; upstream handoff is automatic: inline through 100000 chars, artifact ref above that.
- Preserve raw same-session evidence apart from bounded capture, truncation, and delimiter-safe rendering.
- Do not add output-laundering, credential filtering, old-schema fallback, or parallel schemas unless the user explicitly changes the product contract.
- There is no implicit per-step timeout. Encourage `limits.timeoutSecondsPerStep` for broad review, implementation, untrusted, or tool-using runs.
- `agent_team` is non-atomic and not crash-resumable.

## Library discovery and trust lessons

`agent_team` discovers reusable agents from three source-qualified libraries. Keep docs, schema copy, skill guidance, and tests clear about each search path:

- `package:name`: bundled package prompts from `agents/*.md`; enabled by default.
- `user:name`: personal prompts from `${PI_CODING_AGENT_DIR}/agents/*.md`, or `~/.pi/agent/agents/*.md` when unset; enabled by default.
- `project:name`: nearest project `.pi/agents/*.md`; disabled by default and loaded only through explicit `projectAgents` trust.

The `user-agents-dir-project-scoped` guard prevents project-controlled prompts from masquerading as trusted user prompts. It must deny user-agent directories lexically or physically contained under the current project root, including symlink escapes. It must not treat the global Pi config root `~/.pi` as a project `.pi` marker. If that diagnostic appears unexpectedly, inspect the cwd, configured user-agent dir, realpaths, and nearest `.git`/project `.pi` markers before advising callers to disable user sources.

## Runtime boundaries

Pi integration depends on installed Pi extension semantics. Re-read installed Pi docs/source before changing extension hooks, tool registration, subprocess launch flags, package loading, or mode behavior:

- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/packages.md`
- installed runtime under `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/dist/`

Do not patch or edit Pi vendor code.

## Skill ownership

The `pi-multiagent` skill is owned by this repository and is included through `package.json` `pi.skills`. It teaches when and how to invoke the package tool and points to canonical docs for deeper context. The bundled `agents/*.md` files are not Pi skills; they are `agent_team` library prompts surfaced as `package:name` refs.

## Validation gates

Run the risk-appropriate gate before delivery. For normal runtime, docs, or packaging work, run:

```bash
pnpm run gate
npm pack --dry-run --json
git diff --check
```

`pnpm run gate` already runs unit tests, fake Pi smoke, package artifact assertions, package-load checks, public-doc portability checks, and source-size checks.

For live integration changes, also reload Pi and run a focused live smoke with `agent_team` covering catalog refs, bare-name rejection, source-qualified package refs, raw evidence, automatic oversized-output artifact refs, synthesis, failure provenance, and bash/project-settings denial.

## Release discipline

`npm publish` publishes the local filesystem selected by npm package rules, not the last Git commit. Do not publish from an uncommitted or unvalidated tree. Treat release as a provenance chain from source diff to npm tarball, git tag, pushed source, and GitHub Release notes.

Full release choreography:

1. Verify the working tree and intended version class.
   - Public schema/contract replacement in `0.x` normally warrants a minor bump.
   - Package prompt copy, docs, schema, tests, and AGENTS invariants must already be synchronized.
2. Run final pre-version proof from repo root:

```bash
pnpm run gate
npm pack --dry-run --json
git diff --check
git status -sb
```

3. Commit the validated source change:

```bash
git add -A
git commit -m "..."
```

4. Create the version commit and tag. If `package.json` still needs a bump, prefer `npm version <major|minor|patch|x.y.z>` so npm updates package metadata and creates the tag. If `package.json` is already at the intended version, do not rerun `npm version`; create the matching tag after the commit instead:

```bash
npm version minor
# or: npm version patch
# or: npm version 0.2.0
# already bumped only:
git tag "v$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')"
```

5. Re-run release-candidate proof after the version commit/tag and record the npm dry-run identity:

```bash
pnpm run gate
npm pack --dry-run --json
git diff --check
git status -sb
git tag --points-at HEAD
```

6. Stop before `npm publish` when the user asked to publish manually or when credentials/2FA make publication user-owned. Provide the exact `npm publish` command and wait.
7. After the user confirms npm publication, verify the registry artifact before pushing:

```bash
npm view pi-multiagent@$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version') version dist.integrity dist.tarball --json
```

8. Push source and tag only after npm publication is confirmed:

```bash
git push origin main --follow-tags
```

9. Create a GitHub Release page after npm publish and after pushing the version commit/tag. GitHub Releases are not required for Pi installation, but they are the human/community-facing release record and should be kept aligned with npm and tags when this repo already uses them. Mark the newest release latest, include the npm install command, highlights, validation commands, and npm integrity. Do not attach tarballs unless there is a deliberate non-npm asset.

```bash
gh release create "v$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')" \
  -R Tiziano-AI/pi-multiagent \
  --title "pi-multiagent v$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')" \
  --notes-file /tmp/pi-multiagent-release.md \
  --latest
```

10. Final remote proof:

```bash
git status -sb
git ls-remote origin refs/heads/main
git ls-remote --tags origin "v$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')"
npm view pi-multiagent@$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version') version dist.integrity --json
gh release view "v$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')" -R Tiziano-AI/pi-multiagent --json tagName,url,name,isDraft,isPrerelease,publishedAt,targetCommitish
```

## Working-tree rules

Before mutating, run `git status -sb` and inspect dirty files you need to touch. Dirty state can be user-owned. Do not stage, commit, revert, delete, or format unrelated changes unless the user explicitly asks.

Do not commit credentials, `.npmrc`, `.env*`, local Pi config, generated tarballs, runtime temp files, `node_modules`, or package-manager caches.

## Documentation alignment checklist

When behavior, schema, package metadata, package skill text, bundled agent prompts, install paths, validation gates, or release flow changes, update all relevant surfaces in the same pass:

- `VISION.md` for product intent changes.
- `README.md` for user/operator behavior.
- `ARCH.md` for runtime contracts and ownership.
- `AGENTS.md` for repo-local agent procedure and invariants.
- `package.json` for package metadata and npm file inclusion.
- `skills/pi-multiagent/SKILL.md` for model-facing invocation guidance.
- `agents/*.md` for package-agent behavior.
- `tests/` for executable expectations.
- Ignored local `PLAN.md` or `HANDOFF.md` for active work, remaining work, or handoff state.

Do not let docs claim a feature that runtime/tests do not implement, or let runtime expose behavior not explained in docs.
