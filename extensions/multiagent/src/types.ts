/** Shared contracts for the detached-only Pi multiagent package. */

export type AgentTeamAction = "catalog" | "start" | "run_status" | "step_result" | "message" | "cancel" | "cleanup" | "missing/invalid";
export type ExecutionAction = Exclude<AgentTeamAction, "missing/invalid">;
export type AgentSource = "package" | "user" | "project" | "inline";
export type LibrarySource = "package" | "user" | "project";
export type InvocationAgentKind = "inline" | "library";
export type ThinkingLevel = "inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type InvocationThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type RunStatus = "running" | "succeeded" | "mixed" | "failed" | "canceling" | "canceled" | "expired";

export interface StepUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "blocked" | "timed_out" | "canceled";
export type MessageChannel = "steer" | "follow_up";
export type NotifyMode = "none" | "final" | "milestones";
export type SubagentSkillMode = "enabled" | "disabled";
export type EventType = "run" | "step" | "assistant_delta" | "assistant_final" | "tool" | "diagnostic" | "parent_message" | "rpc" | "ui";

export const DEFAULT_LIBRARY_SOURCES: LibrarySource[] = ["package"];
export const DEFAULT_GRAPH_LIBRARY_SOURCES: LibrarySource[] = ["package"];
export const LIBRARY_SOURCE_VALUES = ["package", "user", "project"] as const;
export const AGENT_TEAM_ACTION_VALUES = ["catalog", "start", "run_status", "step_result", "message", "cancel", "cleanup"] as const;
export const INVOCATION_AGENT_KIND_VALUES = ["inline", "library"] as const;
export const THINKING_LEVEL_VALUES = ["inherit", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
export const INVOCATION_THINKING_LEVEL_VALUES = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export const RUN_STATUS_VALUES = ["running", "succeeded", "mixed", "failed", "canceling", "canceled", "expired"] as const;
export const STEP_STATUS_VALUES = ["pending", "running", "succeeded", "failed", "blocked", "timed_out", "canceled"] as const;
export const MESSAGE_CHANNEL_VALUES = ["steer", "follow_up"] as const;
export const NOTIFY_MODE_VALUES = ["none", "final", "milestones"] as const;
export const SUBAGENT_SKILL_MODE_VALUES = ["enabled", "disabled"] as const;
export const PUBLIC_ID_PATTERN = "^[a-z][a-z0-9-]{0,62}$";
export const RUN_ID_PATTERN = "^r[1-9][0-9]{0,6}$";
export const SOURCE_QUALIFIED_LIBRARY_REF_PATTERN = "^(package|user|project):[a-z][a-z0-9-]{0,62}$";
export const TOOL_NAME_PATTERN = "^[A-Za-z][A-Za-z0-9_-]{0,63}$";
export const BUILTIN_CHILD_TOOL_NAMES = ["read", "grep", "find", "ls", "bash", "edit", "write"] as const;
export const READONLY_CHILD_TOOL_NAMES = ["read", "grep", "find", "ls"] as const;
export const SHELL_CHILD_TOOL_NAMES = ["bash"] as const;
export const MUTATION_CHILD_TOOL_NAMES = ["edit", "write"] as const;
export const EXTENSION_SOURCE_SCOPE_VALUES = ["user", "project", "temporary"] as const;
export const EXTENSION_SOURCE_ORIGIN_VALUES = ["package", "top-level"] as const;
export const SKILL_NAME_PATTERN = "^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$";

export type BuiltinChildToolName = (typeof BUILTIN_CHILD_TOOL_NAMES)[number];
export type ExtensionSourceScope = (typeof EXTENSION_SOURCE_SCOPE_VALUES)[number];
export type ExtensionSourceOrigin = (typeof EXTENSION_SOURCE_ORIGIN_VALUES)[number];
export const MAX_STEPS = 16;
export const MAX_DEPENDENCIES_PER_STEP = 12;
export const DEFAULT_CONCURRENCY = 6;
export const MAX_CONCURRENCY = 10;
export const DEFAULT_TIMEOUT_SECONDS_PER_STEP = 7200;
export const MAX_TIMEOUT_SECONDS_PER_STEP = 36000;
export const INLINE_HANDOFF_CHARS = 12000;
export const INLINE_HANDOFF_PREVIEW_CHARS = 2000;
export const MAX_TEXT_FIELD_CHARS = 50000;
export const MAX_SHORT_TEXT_FIELD_CHARS = 1000;
export const MAX_PATH_FIELD_CHARS = 4096;
export const MAX_CALLER_SKILLS = 128;
export const MAX_GRAPH_FILE_BYTES = 256 * 1024;
export const MAX_AGENT_FILE_BYTES = 128 * 1024;
export const DEFAULT_MAX_RUN_SECONDS = 86400;
export const MAX_MAX_RUN_SECONDS = 86400;
export const DEFAULT_TERMINAL_RETENTION_SECONDS = 86400;
export const MAX_TERMINAL_RETENTION_SECONDS = 604800;
export const DEFAULT_RESULT_PREVIEW_MAX_BYTES = 50 * 1024;
export const MAX_RESULT_PREVIEW_BYTES = 200000;
export const MAX_RUN_STATUS_WAIT_SECONDS = 60;
export const DEFAULT_NOTIFY_MODE: NotifyMode = "milestones";
export const DEFAULT_NOTIFY_MAX_NOTICES = 12;
export const MAX_NOTIFY_MAX_NOTICES = 100;
export const DEFAULT_NOTIFY_MIN_INTERVAL_SECONDS = 10;
export const MAX_NOTIFY_MIN_INTERVAL_SECONDS = 3600;
export const MAX_PARENT_MESSAGE_CHARS = 50000;
export const MAX_CLIENT_MESSAGE_ID_CHARS = 128;
export const MAX_EVENTS_PER_RUN = 2000;
export const MAX_LIVE_DETACHED_RUNS = 16;
export const MAX_RETAINED_DETACHED_RUNS = 64;
export const MAX_PARENT_MESSAGES_PER_STEP = 16;
export const MAX_PARENT_MESSAGE_CHARS_PER_STEP = 65536;
export const MAX_STEP_OUTPUT_BYTES = 4 * 1024 * 1024;
export const MAX_ASSISTANT_FINAL_MESSAGES_PER_STEP = 64;
export const RPC_RECORD_MAX_CHARS = 8 * 1024 * 1024;
export const STDERR_PREVIEW_CHARS = 6000;
export const EVENT_PREVIEW_CHARS = 2000;

export interface AgentDiagnostic {
	code: string;
	message: string;
	path: string | undefined;
	severity: "info" | "warning" | "error";
	action?: AgentTeamAction;
	fields?: string[];
	repair?: string;
}

export interface LibraryOptions {
	sources: LibrarySource[];
	query: string | undefined;
}

export interface GraphLibraryOptions {
	sources: LibrarySource[];
}

export interface GraphAuthority {
	allowFilesystemRead: boolean;
	allowShellTools: boolean;
	allowMutationTools: boolean;
	allowExtensionCode: boolean;
}

export interface TeamLimits {
	concurrency: number;
	timeoutSecondsPerStep: number;
}

export interface StepOutputLimit {
	maxBytes: number;
	maxAssistantFinals: number;
}

export interface NotifyOptions {
	mode: NotifyMode;
	maxNotices: number;
	minIntervalSeconds: number;
}

export interface StartOptions {
	maxRunSeconds: number;
	terminalRetentionSeconds: number;
	notify: NotifyOptions;
}

export interface AgentConfig {
	name: string;
	ref: string;
	description: string;
	tags: string[];
	tools: string[] | undefined;
	model: string | undefined;
	thinking: InvocationThinkingLevel | undefined;
	systemPrompt: string;
	source: Exclude<AgentSource, "inline">;
	filePath: string;
	sha256: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	diagnostics: AgentDiagnostic[];
	packageAgentsDir: string;
	userAgentsDir: string;
	projectAgentsDir: string | undefined;
	sources: LibrarySource[];
}

export interface ExtensionToolProvenanceSpec {
	source: string;
	scope?: ExtensionSourceScope;
	origin?: ExtensionSourceOrigin;
}

export interface ExtensionToolGrantSpec {
	name: string;
	from: ExtensionToolProvenanceSpec;
}

export interface ParentSkillSourceInfo {
	path: string;
	source: string;
	scope: ExtensionSourceScope;
	origin: ExtensionSourceOrigin;
	baseDir: string | undefined;
}

export interface ParentSkillInfo {
	name: string;
	description: string | undefined;
	sourceInfo: ParentSkillSourceInfo;
}

export interface ParentSkillInventory {
	apiAvailable: boolean;
	readActive: boolean;
	errorMessage: string | undefined;
	skills: ParentSkillInfo[];
}

export interface ResolvedCallerSkillSource extends ParentSkillSourceInfo {
	realpath: string;
	dev: number;
	ino: number;
	size: number;
	mtimeMs: number;
	sha256: string;
}

export interface ResolvedCallerSkill {
	name: string;
	description: string | undefined;
	source: ResolvedCallerSkillSource;
}

export interface ParentToolSourceInfo {
	path: string;
	source: string;
	scope: ExtensionSourceScope;
	origin: ExtensionSourceOrigin;
	baseDir: string | undefined;
}

export interface ParentToolInfo {
	name: string;
	description: string | undefined;
	sourceInfo: ParentToolSourceInfo;
	active: boolean;
}

export interface ParentToolInventory {
	apiAvailable: boolean;
	errorMessage: string | undefined;
	tools: ParentToolInfo[];
}

export interface ResolvedExtensionSource {
	path: string;
	realpath: string;
	source: string;
	scope: ExtensionSourceScope;
	origin: ExtensionSourceOrigin;
	baseDir: string | undefined;
	dev: number;
	ino: number;
	size: number;
	mtimeMs: number;
	sha256: string | undefined;
}

export interface ResolvedExtensionToolGrant {
	name: string;
	description: string | undefined;
	source: ResolvedExtensionSource;
}

interface GraphStepAgentSharedInput {
	tools?: string[];
	extensionTools?: ExtensionToolGrantSpec[];
	model?: string;
	thinking?: InvocationThinkingLevel;
}

export interface GraphStepAgentInput extends GraphStepAgentSharedInput {
	system?: string;
	ref?: string;
}

export interface GraphStepInput {
	id: string;
	agent: GraphStepAgentInput;
	task: string;
	needs?: string[];
	after?: string[];
	cwd?: string;
	outputLimit?: Partial<StepOutputLimit>;
}

export interface GraphSpecInput {
	objective: string;
	library?: { sources?: LibrarySource[] };
	authority?: Partial<GraphAuthority>;
	steps: GraphStepInput[];
	limits?: Partial<TeamLimits>;
}

export interface ResolvedAgent {
	id: string;
	ref: string;
	name: string;
	kind: InvocationAgentKind;
	description: string;
	tools: string[];
	extensionTools: ResolvedExtensionToolGrant[];
	callerSkills: ResolvedCallerSkill[];
	systemPrompt: string;
	model: string | undefined;
	thinking: InvocationThinkingLevel | undefined;
	source: AgentSource;
	filePath: string | undefined;
	sha256: string | undefined;
}

export interface CwdIdentity {
	realpath: string;
	dev: number;
	ino: number;
}

export interface TeamStepSpec {
	id: string;
	agent: ResolvedAgent;
	task: string;
	needs: string[];
	after: string[];
	cwd: string;
	cwdIdentity: CwdIdentity;
	outputLimit: StepOutputLimit;
}

export interface ResolvedGraph {
	objective: string;
	library: GraphLibraryOptions;
	authority: GraphAuthority;
	steps: TeamStepSpec[];
	limits: TeamLimits;
	options: StartOptions;
	graphHash: string;
	diagnostics: AgentDiagnostic[];
}

export interface BackgroundEvent {
	seq: number;
	time: string;
	stepId: string | undefined;
	type: EventType;
	label: string | undefined;
	preview: string | undefined;
	status: string | undefined;
}

export interface RunSnapshot {
	runId: string;
	objective: string;
	status: RunStatus;
	terminal: boolean;
	createdAt: string;
	updatedAt: string;
	expiresAt: string | undefined;
	liveStepIds: string[];
	sinkStepIds: string[];
	lastEvent: string | undefined;
	canMessage: boolean;
	canCancel: boolean;
	canCleanup: boolean;
	counts: Record<StepStatus, number>;
	teamUsage?: StepUsage;
}

export interface StepArtifactReference {
	stepId: string;
	status: StepStatus | "missing";
	filePath: string | undefined;
	chars: number | undefined;
}

export interface ChildSessionMetadata {
	sessionId: string | undefined;
	sessionName: string | undefined;
	sessionFile: string | undefined;
	sessionDir: string | undefined;
	launchSessionDir: string | undefined;
	stateSource: "rpc_get_state" | "unavailable";
}

export interface StepRetryRecord {
	attempt: number;
	reason: string;
	childSession: ChildSessionMetadata | undefined;
}

export interface StepSnapshot {
	id: string;
	status: StepStatus;
	agentRef: string;
	model: string | undefined;
	thinking: string | undefined;
	effectiveTools: string[];
	extensionTools: string[];
	callerSkills: string[];
	outputLimit?: StepOutputLimit;
	needs: string[];
	after: string[];
	startedAt: string | undefined;
	endedAt: string | undefined;
	lastActivity: string | undefined;
	errorMessage: string | undefined;
	outputFilePath?: string;
	outputChars?: number;
	taskPreview?: string;
	cwd?: string;
	stopReason?: string;
	upstreamArtifacts?: StepArtifactReference[];
	childSession?: ChildSessionMetadata;
	retryHistory?: StepRetryRecord[];
	usage?: StepUsage;
}

export interface StepOutput {
	stepId: string;
	status: StepStatus;
	text: string | undefined;
	filePath: string | undefined;
	chars: number;
	childSession?: ChildSessionMetadata;
	retryHistory?: StepRetryRecord[];
}

export type RunStatusWaitOutcome = "material" | "timeout" | "already-material" | "terminal";

export interface RunStatusWaitReceipt {
	requestedSeconds: number;
	outcome: RunStatusWaitOutcome;
	stepId: string | undefined;
	cursorBefore: string;
	cursorAfter: string;
}

export interface MessageReceipt {
	runId: string;
	stepId: string;
	channel: MessageChannel;
	clientMessageId: string | undefined;
	accepted: boolean;
	undeliveredReason: string | undefined;
	reused?: boolean;
}

export interface AgentTeamNotice {
	runId: string;
	mode: NotifyMode;
	terminal: boolean;
	reasons: string[];
	noticeCount: number;
	noticeLimitReached: boolean;
}

export interface CleanupReceipt {
	runId: string;
	deletedPaths: string[];
}

export interface AgentTeamError {
	code: string;
	message: string;
}

export interface CatalogAgentSummary {
	name: string;
	ref: string;
	source: Exclude<AgentSource, "inline">;
	description: string;
	tags: string[];
	tools: string[] | undefined;
	model: string | undefined;
	thinking: string | undefined;
	filePath: string;
	sha256: string;
}

export interface CatalogExtensionToolSummary {
	name: string;
	description: string | undefined;
	from: ExtensionToolProvenanceSpec;
	active: boolean;
}

export interface AgentTeamDetails {
	kind: "agent_team";
	action: AgentTeamAction;
	ok: boolean;
	diagnostics: AgentDiagnostic[];
	error: AgentTeamError | undefined;
	library: LibraryOptions | undefined;
	catalog: CatalogAgentSummary[];
	extensionTools: CatalogExtensionToolSummary[];
	run: RunSnapshot | undefined;
	cursor: string | undefined;
	events: BackgroundEvent[];
	steps: StepSnapshot[];
	outputs: StepOutput[];
	wait: RunStatusWaitReceipt | undefined;
	message: MessageReceipt | undefined;
	cleanup: CleanupReceipt | undefined;
	notice: AgentTeamNotice | undefined;
}

export interface AgentInvocationDefaults {
	model: string | undefined;
	thinking: string | undefined;
}

export interface AgentInvocationMetadata {
	model: string | undefined;
	thinking: string | undefined;
}
