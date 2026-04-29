# pi-multiagent plan

Active objective: prepare the standalone `/Users/tiziano/Code/pi-multiagent` repository for a `0.1.1` patch release that adds npm-visible canonical docs, a product-owned `pi-multiagent` skill, and sensible git/npm ignore boundaries, without running `npm publish`.

Current contract:

- Public schema fields are `action`, `objective`, `library`, `agents`, `steps`, `synthesis`, and `limits`.
- Runtime validation follows the schema shape and reports normal validation diagnostics for invalid calls.
- Catalog returns source-qualified refs such as `package:reviewer`.
- Steps and synthesis accept invocation-local agent ids or source-qualified library refs.
- Invocation-local library bindings use explicit `ref`.
- Bare library names are not resolved.
- Package, user, and project agents with the same frontmatter name remain distinct as source-qualified refs.
- Subagent stdout, raw stderr, malformed stdout diagnostics, model text, tool previews, diagnostics, output files, catalog metadata, and structured failure provenance are same-session evidence. Structured details and artifacts preserve captured evidence raw apart from bounded capture/truncation. Model-facing output blocks escape delimiter-like line starts, and inline summaries compact whitespace for display.
- Child prompts and model-facing results treat upstream, tool, repo, quoted, and subagent output as untrusted evidence, not instructions.
- `file-ref` receivers must include the exact `read` tool; `agent-team-synthesizer` is reserved for the default synthesis agent.
- `failureProvenance` is structured so the first observed failure stays separate from parent closeout fields, and model-facing provenance puts JSON-stringed likely root, first observed cause, closeout, and termination flag first for caller-agent triage.
- Product timeout and lifecycle contracts remain unchanged: no implicit per-step timeout; callers should set `limits.timeoutSecondsPerStep` for broad review, implementation, untrusted, or tool-using runs. `agent_team` is non-atomic and not crash-resumable.
- Standalone package identity is `pi-multiagent`, current release candidate version `0.1.1`, source repo `/Users/tiziano/Code/pi-multiagent`, GitHub repo `https://github.com/Tiziano-AI/pi-multiagent`, and npm package `pi-multiagent`.
- Canonical package docs are `AGENTS.md`, `VISION.md`, `README.md`, and `ARCH.md`.
- The package-owned Pi skill is `skills/pi-multiagent/SKILL.md`; bundled `agents/*.md` files remain `agent_team` library prompts, not Pi skills.

Release workflow:

- Validate local package candidate.
- Commit the docs/skill change.
- Run `npm version patch` to create the `0.1.1` version commit and `v0.1.1` tag.
- Stop before `npm publish` so the user can publish manually.
- After the user confirms npm publish succeeded, push `main` and `v0.1.1`, then create the GitHub release.

Current proof:

- `0.1.0` was published to npm and released on GitHub.
- Targeted JSON-event and delegation tests passed after the latest provenance, closeout, raw-stderr, capture-overflow, and caller-agent UX edits.
- Local package gate passed with 140 tests after the latest source edits.
- Residue scans passed for disallowed terminology, alternate catalog formatter names, and stale ref wording after the latest source edits.
- Source metrics passed at 16 extension TypeScript files, 3325 lines, and 136196 bytes.
- Focused live smoke after the final reload passed for catalog refs, bare-name rejection, raw evidence, exact-read file-ref, source-qualified package refs, synthesis, invalid-model provenance with quoted fields and parent exit fact, and bash/project-settings denial with quoted provenance.

Current `0.1.1` release-prep proof:

- `pnpm run gate` passed with 140 tests.
- `npm pack --dry-run --json` produced `pi-multiagent-0.1.1.tgz` with 29 intended package entries: `AGENTS.md`, `VISION.md`, `LICENSE`, docs, package agents, `skills/pi-multiagent/SKILL.md`, extension sources, and `package.json`; tests, runtime state, tarballs, and `PLAN.md` were excluded.
- `npm publish --dry-run` passed for `pi-multiagent@0.1.1`.
- Git ignore checks covered local env, `.npmrc`, `.pi`, continuation docs, tarballs, dependency dirs, temp/cache paths, logs, and OS noise.
- The defensive `.npmignore` excludes source-control/runtime/dev-only state while package publishing remains primarily allowlisted by `package.json` `files`.
- `git diff --check` passed.
- `npm view pi-multiagent@0.1.1 version` returned npm `E404`, so `0.1.1` remains unpublished at this checkpoint.
- Local commit/tag proof exists for the docs/skill commit, the `0.1.1` version commit, and local tag `v0.1.1`.

Remaining verification:

- User-run `npm publish` remains pending by request.

Out of scope unless requested:

- a durable run ledger or crash-resume implementation
- human slash-command workflows or unrelated source-tree moves
