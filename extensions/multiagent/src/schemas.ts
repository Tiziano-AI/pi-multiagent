/** TypeBox schema for the detached-only `agent_team` Pi tool. */

import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import {
	AGENT_TEAM_ACTION_VALUES,
	BUILTIN_CHILD_TOOL_NAMES,
	DEFAULT_CONCURRENCY,
	DEFAULT_MAX_RUN_SECONDS,
	DEFAULT_NOTIFY_MAX_NOTICES,
	DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS,
	DEFAULT_NOTIFY_MODE,
	DEFAULT_RESULT_PREVIEW_MAX_BYTES,
	DEFAULT_TERMINAL_RETENTION_SECONDS,
	DEFAULT_TIMEOUT_SECONDS_PER_STEP,
	EXTENSION_SOURCE_ORIGIN_VALUES,
	EXTENSION_SOURCE_SCOPE_VALUES,
	LIBRARY_SOURCE_VALUES,
	MAX_CLIENT_MESSAGE_ID_CHARS,
	MAX_CONCURRENCY,
	MAX_DEPENDENCIES_PER_STEP,
	MAX_MAX_RUN_SECONDS,
	MAX_NOTIFY_MAX_NOTICES,
	MAX_NOTIFY_MIN_INTERVAL_SECONDS,
	MAX_PARENT_MESSAGE_CHARS,
	MAX_PATH_FIELD_CHARS,
	MAX_RESULT_PREVIEW_BYTES,
	MAX_RUN_STATUS_WAIT_SECONDS,
	MAX_SHORT_TEXT_FIELD_CHARS,
	MAX_STEPS,
	MAX_TERMINAL_RETENTION_SECONDS,
	MAX_TEXT_FIELD_CHARS,
	MAX_TIMEOUT_SECONDS_PER_STEP,
	MESSAGE_CHANNEL_VALUES,
	NOTIFY_MODE_VALUES,
	PUBLIC_ID_PATTERN,
	RUN_ID_PATTERN,
	SOURCE_QUALIFIED_LIBRARY_REF_PATTERN,
	TOOL_NAME_PATTERN,
} from "./types.ts";

const StrictObjectOptions = { additionalProperties: false };

function publicId(description: string) {
	return Type.String({ description, minLength: 1, maxLength: 63, pattern: PUBLIC_ID_PATTERN });
}

function nonEmptyText(description: string, maxLength = MAX_TEXT_FIELD_CHARS) {
	return Type.String({ description, minLength: 1, maxLength });
}

function sourceQualifiedLibraryRef(description: string) {
	return Type.String({ description, minLength: 1, maxLength: 72, pattern: SOURCE_QUALIFIED_LIBRARY_REF_PATTERN });
}

const LibrarySchema = Type.Object(
	{
		sources: Type.Optional(Type.Array(StringEnum(LIBRARY_SOURCE_VALUES), { description: 'Catalog-only sources. Default ["package"]. For start, use graph.library.sources; user/project catalog rows require matching start sources.', minItems: 1, maxItems: 3 })),
		query: Type.Optional(Type.String({ description: "Catalog-only routing search. Exact phrases and non-stopword query terms are matched against role names/ref names (without source prefix), descriptions, tags, default tools, model, and thinking; source/path stay provenance only.", minLength: 1, maxLength: MAX_SHORT_TEXT_FIELD_CHARS })),
	},
	StrictObjectOptions,
);

const GraphLibrarySchema = Type.Object(
	{
		sources: Type.Optional(Type.Array(StringEnum(LIBRARY_SOURCE_VALUES), { description: 'Start-only library sources. Default ["package"]. Include "project" to load local project agents when present.', minItems: 1, maxItems: 3 })),
	},
	StrictObjectOptions,
);

const AuthoritySchema = Type.Object(
	{
		allowFilesystemRead: Type.Optional(Type.Boolean({ description: "Allow the filesystem read/discovery suite: read, grep, find, and ls. Default false.", default: false })),
		allowShellTools: Type.Optional(Type.Boolean({ description: "Allow the bash shell probe tool. Bash is trusted command execution and can mutate through commands. Default false.", default: false })),
		allowMutationTools: Type.Optional(Type.Boolean({ description: "Allow structured edit and write child tools. Default false.", default: false })),
		allowExtensionCode: Type.Optional(Type.Boolean({ description: "Allow explicit callable extensionTools grants. This does not disable or enable normal Pi extension discovery for model providers. Default false.", default: false })),
	},
	StrictObjectOptions,
);

const ExtensionToolFromSchema = Type.Object(
	{
		source: nonEmptyText("Parent tool sourceInfo.source expected for this extension tool grant; this is provenance, not an install source.", MAX_SHORT_TEXT_FIELD_CHARS),
		scope: Type.Optional(StringEnum(EXTENSION_SOURCE_SCOPE_VALUES, { description: 'Optional expected parent sourceInfo.scope: "user", "project", or "temporary".' })),
		origin: Type.Optional(StringEnum(EXTENSION_SOURCE_ORIGIN_VALUES, { description: 'Optional expected parent sourceInfo.origin: "package" or "top-level".' })),
	},
	StrictObjectOptions,
);

const ExtensionToolGrantSchema = Type.Object(
	{
		name: Type.String({ description: "Parent-active extension tool name to expose to this step.", minLength: 1, maxLength: 64, pattern: TOOL_NAME_PATTERN }),
		from: ExtensionToolFromSchema,
	},
	StrictObjectOptions,
);

const StepAgentSchema = Type.Object(
	{
		system: Type.Optional(nonEmptyText("Inline step-agent system prompt. Set exactly one of system or ref; runtime planning rejects missing or mixed bindings.")),
		ref: Type.Optional(sourceQualifiedLibraryRef('Source-qualified library ref such as "package:reviewer". Set exactly one of system or ref; runtime planning rejects missing or mixed bindings.')),
		tools: Type.Optional(Type.Array(StringEnum(BUILTIN_CHILD_TOOL_NAMES), { description: "Explicit built-in child tool profile. Every child keeps at least the read/discovery suite, so omitted or [] resolves to read, grep, find, and ls and requires graph.authority.allowFilesystemRead:true. For library agents, explicit tools replace the whole catalog defaultTools profile; mandatory read/discovery is then added. It does not append. Any read/discovery primitive expands to the full read, grep, find, ls suite. package:validator requires effective bash; package:worker requires effective edit or write.", maxItems: 24 })),
		extensionTools: Type.Optional(Type.Array(ExtensionToolGrantSchema, { description: "Explicit parent-active callable extension tool grants for this step.", maxItems: 24 })),
	},
	{ ...StrictObjectOptions, description: "Step-local inline agent or source-qualified library agent. Set exactly one of system or ref. No invocation-local agent registry is used." },
);

const StepSchema = Type.Object(
	{
		id: publicId("Unique step id."),
		agent: StepAgentSchema,
		task: nonEmptyText("Concrete delegated task. Upstream outputs are appended as untrusted evidence."),
		needs: Type.Optional(Type.Array(publicId("Strict dependency step id; every listed step must succeed before this step starts."), { description: "Step ids that must succeed before this step starts.", maxItems: MAX_DEPENDENCIES_PER_STEP })),
		after: Type.Optional(Type.Array(publicId("Terminal dependency step id; listed steps may succeed or fail before this step starts."), { description: "Step ids that must terminalize before this step starts, regardless of success or failure.", maxItems: MAX_DEPENDENCIES_PER_STEP })),
		cwd: Type.Optional(nonEmptyText("Existing working directory for this step, resolved inside the invocation cwd.", MAX_PATH_FIELD_CHARS)),
	},
	StrictObjectOptions,
);

const LimitsSchema = Type.Object(
	{
		concurrency: Type.Optional(Type.Number({ description: `Maximum concurrent runnable steps. Default ${DEFAULT_CONCURRENCY}.`, minimum: 1, maximum: MAX_CONCURRENCY, multipleOf: 1 })),
		timeoutSecondsPerStep: Type.Optional(Type.Number({ description: `Per-step subprocess timeout seconds. Default ${DEFAULT_TIMEOUT_SECONDS_PER_STEP}.`, minimum: 1, maximum: MAX_TIMEOUT_SECONDS_PER_STEP, multipleOf: 1, default: DEFAULT_TIMEOUT_SECONDS_PER_STEP })),
	},
	StrictObjectOptions,
);

const GraphSchema = Type.Object(
	{
		objective: nonEmptyText("Overall objective for the detached run."),
		library: Type.Optional(GraphLibrarySchema),
		authority: Type.Optional(AuthoritySchema),
		steps: Type.Array(StepSchema, { description: "Static DAG steps.", minItems: 1, maxItems: MAX_STEPS }),
		limits: Type.Optional(LimitsSchema),
	},
	StrictObjectOptions,
);

const NotifyOptionsSchema = Type.Object(
	{
		mode: Type.Optional(StringEnum(NOTIFY_MODE_VALUES, { description: 'Pushed update mode for detached start: "none", "final", or "milestones". Default "milestones".', default: DEFAULT_NOTIFY_MODE })),
		maxNotices: Type.Optional(Type.Number({ description: "Maximum non-terminal milestone notices before terminal notice. Default 12.", minimum: 0, maximum: MAX_NOTIFY_MAX_NOTICES, multipleOf: 1, default: DEFAULT_NOTIFY_MAX_NOTICES })),
		minIntervalSeconds: Type.Optional(Type.Number({ description: "Minimum seconds between non-terminal milestone notices. Default 10.", minimum: 0, maximum: MAX_NOTIFY_MIN_INTERVAL_SECONDS, multipleOf: 1, default: DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS })),
	},
	StrictObjectOptions,
);

const StartOptionsSchema = Type.Object(
	{
		maxRunSeconds: Type.Optional(Type.Number({ description: "Maximum live run seconds before expiry cancellation.", minimum: 1, maximum: MAX_MAX_RUN_SECONDS, multipleOf: 1, default: DEFAULT_MAX_RUN_SECONDS })),
		terminalRetentionSeconds: Type.Optional(Type.Number({ description: "Seconds to retain terminal run state for run_status/cleanup.", minimum: 1, maximum: MAX_TERMINAL_RETENTION_SECONDS, multipleOf: 1, default: DEFAULT_TERMINAL_RETENTION_SECONDS })),
		notify: Type.Optional(NotifyOptionsSchema),
	},
	StrictObjectOptions,
);

export const AgentTeamSchema = Type.Object(
	{
		action: StringEnum(AGENT_TEAM_ACTION_VALUES, { description: 'Action decision: "catalog" discovers refs/provenance, "start" launches a detached graph, "run_status" reads compact run/sink state or performs a bounded wait/read with waitSeconds and a wait receipt, "step_result" inspects exactly one step, "message" sends one live clarification/scope repair for delivery to a running child, "cancel" stops a live run only when stopping is explicitly more valuable than completion, and "cleanup" deletes terminal artifacts when retained evidence is no longer needed.' }),
		library: Type.Optional(LibrarySchema),
		graph: Type.Optional(GraphSchema),
		graphFile: Type.Optional(nonEmptyText("Start-only relative path to a pure detached graph JSON file.", MAX_PATH_FIELD_CHARS)),
		options: Type.Optional(StartOptionsSchema),
		runId: Type.Optional(Type.String({ description: "Short process-local detached run handle returned by start for this Pi session.", minLength: 2, maxLength: 8, pattern: RUN_ID_PATTERN })),
		cursor: Type.Optional(Type.String({ description: "run_status cursor returned by a prior run_status call.", minLength: 1, maxLength: 128 })),
		stepId: Type.Optional(publicId("Step id for run_status wait/debug targeting only, or the required target for step_result/message. run_status stepId does not select step text; use step_result for one-step output.")),
		waitSeconds: Type.Optional(Type.Number({ description: "run_status-only bounded wait/read control. Before returning the same compact run_status snapshot plus wait receipt, wait until a material parent-visible event occurs or this timeout expires: run terminal/cancel/expiry, sink or targeted step finish, failed/blocked/timed-out/canceled step, or error diagnostic. Routine assistant/tool/UI activity does not wake run_status, and timeout is not a failure.", minimum: 1, maximum: MAX_RUN_STATUS_WAIT_SECONDS, multipleOf: 1 })),
		maxBytes: Type.Optional(Type.Number({ description: "run_status/step_result-only aggregate byte cap for assistant previews when preview:true and for run_status raw debug events when debugEvents:true; not valid for catalog or start.", minimum: 1, maximum: MAX_RESULT_PREVIEW_BYTES, multipleOf: 1, default: DEFAULT_RESULT_PREVIEW_MAX_BYTES })),
		preview: Type.Optional(Type.Boolean({ description: "run_status/step_result-only opt-in to include bounded assistant text previews. Default false returns status, diagnostics, step rows, artifact indexes, and artifact paths without child final text.", default: false })),
		debugEvents: Type.Optional(Type.Boolean({ description: "run_status-only opt-in to include raw background event records. Default false.", default: false })),
		channel: Type.Optional(StringEnum(MESSAGE_CHANNEL_VALUES, { description: 'Message-only child RPC channel. "steer" queues after the current assistant turn/tool batch before the next LLM call; "follow_up" defers a live follow-up until the child is quiescent before terminalization, if still messageable. It is not post-terminal chat and must not be used to force premature finals.' })),
		text: Type.Optional(nonEmptyText("Parent message text for a live step; use for bounded clarification or scope repair, not impatience.", MAX_PARENT_MESSAGE_CHARS)),
		clientMessageId: Type.Optional(Type.String({ description: "Optional idempotency key for message.", minLength: 1, maxLength: MAX_CLIENT_MESSAGE_ID_CHARS })),
		reason: Type.Optional(nonEmptyText("Optional cancel reason; cancel only for explicit stop, unsafe/stuck/obsolete work, or user-prioritized interruption.", MAX_SHORT_TEXT_FIELD_CHARS)),
	},
	StrictObjectOptions,
);

export type AgentTeamInput = Static<typeof AgentTeamSchema>;
export type GraphSpec = Static<typeof GraphSchema>;
