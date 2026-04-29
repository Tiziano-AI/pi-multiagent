# pi-multiagent plan

Active objective: prepare the standalone `/Users/tiziano/Code/pi-multiagent` repository for the first npm/GitHub release of `pi-multiagent` without running `npm publish`.

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
- Standalone package identity is `pi-multiagent`, version `0.1.0`, source repo `/Users/tiziano/Code/pi-multiagent`, GitHub repo `https://github.com/Tiziano-AI/pi-multiagent`, and npm package `pi-multiagent`.

Release workflow:

- Validate local package candidate.
- Commit the standalone repo and create tag `v0.1.0`.
- Stop before `npm publish` so the user can publish manually.
- After the user confirms npm publish succeeded, push `main` and `v0.1.0`, then create the GitHub release.

Current proof:

- Targeted JSON-event and delegation tests passed after the latest provenance, closeout, raw-stderr, capture-overflow, and caller-agent UX edits.
- Local package gate passed with 140 tests after the latest source edits.
- Residue scans passed for disallowed terminology, alternate catalog formatter names, and stale ref wording after the latest source edits.
- Source metrics passed at 16 extension TypeScript files, 3325 lines, and 136196 bytes.
- Focused live smoke after the final reload passed for catalog refs, bare-name rejection, raw evidence, exact-read file-ref, source-qualified package refs, synthesis, invalid-model provenance with quoted fields and parent exit fact, and bash/project-settings denial with quoted provenance.
- Release-prep gate from `/Users/tiziano/Code/pi-multiagent` passed with 140 tests.
- `npm pack --dry-run --json` produced `pi-multiagent-0.1.0.tgz` with 28 intended package entries: `AGENTS.md`, `VISION.md`, `LICENSE`, docs, package agents, extension sources, and `package.json`; tests, runtime state, tarballs, and `PLAN.md` were excluded.
- `git diff --check` passed.
- npm name check still returned `E404 Not Found` before release prep, so `pi-multiagent` appeared unclaimed at that time.

Remaining verification:

- Commit/tag proof for `v0.1.0`.
- User-run `npm publish` remains pending by request.

Out of scope unless requested:

- a durable run ledger or crash-resume implementation
- human slash-command workflows or unrelated source-tree moves
