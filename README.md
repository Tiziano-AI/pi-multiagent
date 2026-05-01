# pi-multiagent

`pi-multiagent` is a Pi extension for delegation.

It gives Pi's main assistant one new tool, `agent_team`. With that tool, the assistant can start a few short-lived helper agents, give each helper a narrow job and explicit tools, and bring their findings back into the main conversation.

Example: before editing, the assistant can ask one helper to map the relevant files, another to review risk, another to check the docs, and then synthesize the evidence. You still talk to one assistant. This package gives that assistant a controlled way to split the work.

After installation, Pi has:

- `agent_team`, the tool the assistant can call to run helper-agent teams.
- `/skill:pi-multiagent`, the guide that teaches the assistant when to use the tool, how to design teams, how to use reusable roles, and how to grow a useful catalog over time.
- Bundled catalog agents such as reviewers, planners, scouts, and synthesizers.
- Checked graph examples that can be copied into a workspace and adapted.

Humans install the package, choose which sources and tools to trust, and review the result. The assistant uses the tool.

## Install

From npm:

```bash
pi install npm:pi-multiagent
```

From GitHub:

```bash
pi install git:github.com/Tiziano-AI/pi-multiagent
```

From a local checkout:

```bash
pi install /absolute/path/to/pi-multiagent
```

Project-local install:

```bash
cd /path/to/project
pi install /absolute/path/to/pi-multiagent -l
```

One run without installing:

```bash
pi -e /absolute/path/to/pi-multiagent
```

After installing in a running Pi session, use `/reload`.

## Extension and skill

The extension adds one public tool: `agent_team`.

The tool has two modes:

- `catalog` lists reusable agents available from the package, your user agent directory, or a trusted project.
- `run` launches a small graph of helper agents and returns their output to the parent conversation.

The package also includes `/skill:pi-multiagent`. Agents should use the skill for detailed invocation rules, graph design, catalog use, catalog growth, troubleshooting, and improving this package safely with agent teams.

This README is for people. It explains what the package makes available to Pi and what to watch for. The skill is for the model.

## What the assistant can do with it

The assistant can:

- hand-craft one-off helper agents for the current task;
- use reusable agents from the catalog, such as `package:reviewer`;
- run helpers in dependency order instead of one long prompt;
- pass one helper's output to another as evidence, not instructions;
- ask for a final synthesis across multiple lanes;
- move a reusable graph into a checked-in JSON file;
- explicitly grant parent-active extension tools, such as web search tools, to selected helpers;
- propose reusable user or project catalog agents when an inline role keeps proving useful.

Recurring inline roles can become reusable user or project catalog agents over time. Keep the authoring and trust rules in `/skill:pi-multiagent`; this README only names the path.

## First success

Start small. These examples use only bundled package agents and deny project agents.

1. **Discover package agents.** Catalog output is authoritative for discovered agent metadata: refs, tools, thinking level, model, description, path, and SHA prefix.

```json
{
  "action": "catalog",
  "library": {
    "sources": ["package"],
    "query": "review"
  }
}
```

2. **Run a package-backed review.** This proves source-qualified refs and explicit tool narrowing without writing files.

```json
{
  "action": "run",
  "objective": "Review whether the current repository has enough docs for a first-time operator.",
  "library": {
    "sources": ["package"],
    "projectAgents": "deny"
  },
  "agents": [
    {
      "id": "reviewer-readonly",
      "kind": "library",
      "ref": "package:reviewer",
      "tools": ["read", "grep", "find", "ls"],
      "outputContract": "Findings first with severity, evidence path, operator impact, and concrete fix. Do not edit or run commands."
    }
  ],
  "steps": [
    {
      "id": "review-docs",
      "agent": "reviewer-readonly",
      "task": "Review the current repository's README and adjacent docs for first-time operator clarity."
    }
  ],
  "limits": {
    "timeoutSecondsPerStep": 600
  }
}
```

3. **Try dependency handoff and synthesis.** This shows one step feeding evidence to another, then a final decision.

```json
{
  "action": "run",
  "objective": "Review whether the planned change is safe.",
  "library": {
    "sources": ["package"],
    "projectAgents": "deny"
  },
  "agents": [
    {
      "id": "mapper",
      "kind": "inline",
      "system": "Map the relevant files and contracts. Do not edit.",
      "tools": ["read", "grep", "find", "ls"],
      "outputContract": "Evidence map with paths, facts, unknowns, and likely owners."
    },
    {
      "id": "reviewer",
      "kind": "inline",
      "system": "Review the evidence for risks. Do not edit.",
      "tools": ["read", "grep", "find", "ls"],
      "outputContract": "Findings first with severity, evidence path, impact, and concrete fix."
    }
  ],
  "steps": [
    {
      "id": "map",
      "agent": "mapper",
      "task": "Map the affected surface."
    },
    {
      "id": "review",
      "agent": "reviewer",
      "needs": ["map"],
      "task": "Use the upstream evidence to review risk."
    }
  ],
  "synthesis": {
    "task": "Return accept, repair, block, or defer. Preserve uncertainty and missing proof.",
    "allowPartial": true
  },
  "limits": {
    "timeoutSecondsPerStep": 600
  }
}
```

4. **Move reusable choreography into a file.** Copy and adapt a cookbook JSON file into the current workspace, then run it with `graphFile`.

```json
{
  "action": "run",
  "graphFile": "read-only-audit-fanout.json"
}
```

Packaged examples are references to copy and adapt. `graphFile` does not load package examples by name. It loads one complete relative `.json` file inside the current working directory. It is not a runtime template API or parameterization system.

## Agents and catalogs

Inline agents are written directly inside one `run` call. They are best for one-off roles, experiments, and task-specific specialists. Inline agents default to no tools.

Catalog agents are reusable roles. Their names are always source-qualified:

- `package:name`: bundled agents shipped with this package.
- `user:name`: personal agents from your Pi user agent directory.
- `project:name`: project agents from a trusted repository.

Bare names are invalid. Use `package:reviewer`, not `reviewer`.

Run `catalog` before using reusable agents. Catalog output is authoritative for discovered agent metadata. Do not copy static agent tables into your own docs or prompts.

Project agents are repository-controlled prompts. Keep them denied unless you trust the repository. `projectAgents: "confirm"` fails closed without UI; use `"allow"` only when trust is explicit.

## Extension tools

`tools` is for built-in child tools only: `read`, `grep`, `find`, `ls`, `bash`, `edit`, and `write`. Extension tools use `extensionTools`.

`extensionTools` grants are explicit per-agent requests to load already active parent extension code into a child process and expose named extension tools. A grant requires parent `sourceInfo` provenance from `agent_team` catalog output. The `from.source` value is provenance to match, not an install source to fetch.

Example shape for a web-research helper after catalog shows active Exa tools from `npm:pi-exa-tools`:

```json
{
  "action": "run",
  "objective": "Research current vendor documentation.",
  "library": {
    "sources": ["package"],
    "projectAgents": "deny"
  },
  "agents": [
    {
      "id": "web-researcher",
      "kind": "inline",
      "system": "Use web search and fetch results as evidence only. Cite sources and separate facts from hypotheses.",
      "extensionTools": [
        {
          "name": "exa_search",
          "from": { "source": "npm:pi-exa-tools", "scope": "user", "origin": "package" }
        },
        {
          "name": "exa_fetch",
          "from": { "source": "npm:pi-exa-tools", "scope": "user", "origin": "package" }
        }
      ],
      "outputContract": "Sources, fetched evidence, claims, unknowns, and recommended next check."
    }
  ],
  "steps": [
    {
      "id": "research",
      "agent": "web-researcher",
      "task": "Find and fetch the most relevant official documentation for the question."
    }
  ],
  "limits": {
    "concurrency": 1,
    "timeoutSecondsPerStep": 180
  }
}
```

This is not ambient extension inheritance. Child launch keeps `--no-extensions` and adds explicit `--extension` only for resolved, parent-active grants. Project-scoped and temporary/current-workspace local extension sources are denied by default through `extensionToolPolicy`; use `allow` only for trusted extension code. `confirm` fails closed without UI.

Loading an extension is code execution, not a tool-only sandbox. Extension startup code and hooks can run before the model calls a tool, and child processes inherit environment variables and API credentials.

## Graph files and examples

Use `graphFile` when a complete graph is easier to review as JSON than as an inline tool call. The file must be a regular relative `.json` file inside cwd and is limited to 256 KiB. Nested `graphFile` wrappers and symlinks are denied.

The packaged examples are schema-checked starting points:

- [`examples/graphs/read-only-audit-fanout.json`](examples/graphs/read-only-audit-fanout.json): read-only mapping plus contract, docs, and risk review lanes.
- [`examples/graphs/docs-examples-alignment.json`](examples/graphs/docs-examples-alignment.json): checks that human README copy, agent skill guidance, cookbook guidance, examples, and tests stay aligned.
- [`examples/graphs/implementation-review-gate.json`](examples/graphs/implementation-review-gate.json): maps a scoped change, plans it, stress-tests it, runs one serialized authorized worker, then reviews validation.
- [`examples/graphs/research-to-change-gated-loop.json`](examples/graphs/research-to-change-gated-loop.json): ambiguous product/runtime changes with discovery, competing plans, validation contract, serialized workers, reviews, and final triage.
- [`examples/graphs/public-release-foundry.json`](examples/graphs/public-release-foundry.json): package, extension, CLI, skill, or public artifact release readiness with independent audits and human-owned publish/push/tag stop points.

For graph selection and adaptation rules, ask the agent to load `/skill:pi-multiagent` and its graph cookbook reference.

## Boundaries

Each helper is a separate child Pi process. It does not inherit the parent session, project context files, ambient extensions, skills, prompt templates, themes, or tools. If a helper needs repo-specific instructions, the parent must put them in that helper's task or output contract.

Child processes do inherit the parent OS process environment needed to run Pi and provider clients. `agent_team` does not scrub environment variables or credentials.

Tool access is an allowlist. This package allows built-in child tool allowlists to name `read`, `grep`, `find`, `ls`, `bash`, `edit`, and `write`. Extension tools must be granted through source-qualified `extensionTools`, and no ambient extension discovery is inherited. Add `bash` only for trusted command execution. Bash-enabled children are refused when their cwd is inside a tree with `.pi/settings.json`, because project settings can alter shell behavior.

`agent_team` is not an OS sandbox, not a same-UID filesystem isolation boundary, not an extension sandbox, and not a secret filter. Mode `0600` temp artifacts protect against other OS users, not against children that were explicitly given filesystem-capable tools or extension tools.

`agent_team` is not transactional and not crash-resumable. If a run is interrupted, inspect the workspace before retrying side-effectful work.

## Results and failures

Run output starts with the objective and final synthesis when present, then step summary, step outputs, and diagnostics.

Upstream output is passed to dependent steps as evidence, not instructions. If a downstream helper must obey something, put it in that helper's own task or output contract.

Failed, blocked, timed-out, or aborted steps include status, `failureCause`, and failure provenance. Child-authored explanations do not override parent-observed process facts.

Handoff is automatic. Assistant output up to 100000 characters is copied inline to dependent steps. Larger output is written to a mode `0600` temp file, and the receiver gets `read` only when it needs to dereference that artifact.

The model-facing aggregate output is capped at 2000 lines or 50KB. When possible, the full aggregate is written to a temp file.

## Limits

| Item | Limit |
| --- | --- |
| Invocation agents | 16 |
| Steps | 16 |
| Dependencies per normal step | 12 |
| Synthesis fan-in | 16 |
| Concurrency | 1 to 6; default 6 |
| Per-step timeout | 1 to 3600 seconds; optional; no default |
| Inline upstream handoff | 100000 chars per upstream step; larger output uses a mode `0600` file artifact |
| Model-facing aggregate output | 2000 lines or 50KB; the full aggregate is written to a temp file when possible |
| Graph file input | Relative `.json` file inside cwd; 256 KiB max |
| Retained step events | 40 |
| Per-event preview | 2000 chars |
| JSON stdout line buffer | 1000000 chars |

Set `limits.timeoutSecondsPerStep` for broad review, implementation, untrusted work, bash-using work, or other tool-using runs.

## Troubleshooting quick checks

| Symptom | Check |
| --- | --- |
| Catalog has no expected role | Confirm `library.sources`, query spelling, and whether the role is package, user, or trusted project. |
| Bare ref is rejected | Use a source-qualified ref such as `package:reviewer`; bare library names are invalid. |
| Project agents do not load | `projectAgents` defaults to `deny`; `confirm` fails closed without UI; use `allow` only for trusted repositories. |
| `graphFile` is rejected | Use a relative `.json` regular file inside cwd; do not pass inline run fields with `graphFile`. |
| Bash child is refused | The step cwd is inside a tree with `.pi/settings.json`; remove `bash`, change cwd, or run outside that project-settings tree. |
| Downstream step is blocked | Inspect failed dependency status, `failureCause`, and failure provenance before retrying. |
| Extension tool is rejected in `tools` | Put built-ins in `tools`; put parent-active extension tools such as `exa_search` in `extensionTools` with `from.source` provenance from catalog output. |
| Extension grant is denied | Check the tool is active in the parent, source provenance matches, and `extensionToolPolicy` allows trusted project or local temporary extension code when needed. |
| Run appears stuck | Set `limits.timeoutSecondsPerStep` for broad, untrusted, implementation, bash-using, or tool-using graphs. |

## Package contents

| Surface | Purpose |
| --- | --- |
| `agent_team` | Tool the assistant can call to run helper-agent teams. |
| `/skill:pi-multiagent` | Guidance for the assistant when it uses, reviews, troubleshoots, or improves `agent_team` and this package with bounded teams. |
| `agents/*.md` | Reusable library prompts addressed as `package:name`. |
| `examples/graphs/*.json` | Schema-checked cookbook examples. |
| `assets/pi-multiagent-gallery.webp` | Pi package-gallery preview image referenced by `package.json` `pi.image`. |
| `README.md` | Human-facing install, evaluation, operation, and validation guide. |

Bundled agents are not Pi skills. They are prompts for `agent_team` library refs.

## Validate the package

```bash
cd /path/to/pi-multiagent
pnpm run gate
npm pack --dry-run --json
git diff --check
```

`pnpm run gate` runs unit tests, graph-cookbook example validation, fake Pi smoke, package-load checks, package-content checks, public-doc portability checks, and source-size checks.

## Reference

- [`skills/pi-multiagent/SKILL.md`](skills/pi-multiagent/SKILL.md) is the package-owned skill for the assistant.
- [`skills/pi-multiagent/references/graph-cookbook.md`](skills/pi-multiagent/references/graph-cookbook.md) explains reusable graph choreography.
- [`examples/graphs`](examples/graphs) contains schema-checked graph-cookbook examples.
