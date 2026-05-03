/** Shared contracts for the model-native Pi multiagent package. */

export type AgentTeamAction = "catalog" | "run" | "missing/invalid";

export type AgentSource = "package" | "user" | "project" | "inline";

export type LibrarySource = "package" | "user" | "project";

export type ProjectAgentsPolicy = "deny" | "confirm" | "allow";

export type InvocationAgentKind = "inline" | "library";

export type ThinkingLevel = "inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type AgentStatus = "pending" | "running" | "succeeded" | "failed" | "aborted" | "timed_out" | "blocked";

export const DEFAULT_LIBRARY_SOURCES: LibrarySource[] = ["package", "user"];
export const DEFAULT_PROJECT_AGENTS_POLICY: ProjectAgentsPolicy = "deny";
export const LIBRARY_SOURCE_VALUES = ["package", "user", "project"] as const;
export const PROJECT_AGENTS_POLICY_VALUES = ["deny", "confirm", "allow"] as const;
export const AGENT_TEAM_ACTION_VALUES = ["catalog", "run"] as const;
export const INVOCATION_AGENT_KIND_VALUES = ["inline", "library"] as const;
export const THINKING_LEVEL_VALUES = ["inherit", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
export const PUBLIC_ID_PATTERN = "^[a-z][a-z0-9-]{0,62}$";
export const SOURCE_QUALIFIED_LIBRARY_REF_PATTERN = "^(package|user|project):[a-z][a-z0-9-]{0,62}$";
export const AGENT_REFERENCE_PATTERN = `(${SOURCE_QUALIFIED_LIBRARY_REF_PATTERN})|${PUBLIC_ID_PATTERN}`;
export const TOOL_NAME_PATTERN = "^[A-Za-z][A-Za-z0-9_-]{0,63}$";
export const BUILTIN_CHILD_TOOL_NAMES = ["read", "grep", "find", "ls", "bash", "edit", "write"] as const;
export const EXTENSION_SOURCE_SCOPE_VALUES = ["user", "project", "temporary"] as const;
export const EXTENSION_SOURCE_ORIGIN_VALUES = ["package", "top-level"] as const;

export type BuiltinChildToolName = (typeof BUILTIN_CHILD_TOOL_NAMES)[number];
export type ExtensionSourceScope = (typeof EXTENSION_SOURCE_SCOPE_VALUES)[number];
export type ExtensionSourceOrigin = (typeof EXTENSION_SOURCE_ORIGIN_VALUES)[number];
export type ExtensionToolTrustPolicy = "deny" | "confirm" | "allow";

export const MAX_INVOCATION_AGENTS = 16;
export const MAX_STEPS = 16;
export const MAX_DEPENDENCIES_PER_STEP = 12;
export const MAX_CONCURRENCY = 6;
export const DEFAULT_TIMEOUT_SECONDS_PER_STEP = 7200;
export const MAX_TIMEOUT_SECONDS_PER_STEP = 36000;
export const INLINE_HANDOFF_CHARS = 100000;
export const OUTPUT_INLINE_CHARS = INLINE_HANDOFF_CHARS;
export const MAX_STDOUT_LINE_CHARS = 1000000;
export const MAX_JSON_STDOUT_LINE_CHARS = 64 * 1024 * 1024;
export const STDERR_PREVIEW_CHARS = 6000;
export const MAX_TEXT_FIELD_CHARS = 50000;
export const MAX_SHORT_TEXT_FIELD_CHARS = 1000;
export const MAX_PATH_FIELD_CHARS = 4096;
export const MAX_MODEL_FIELD_CHARS = 256;
export const MAX_GRAPH_FILE_BYTES = 256 * 1024;
export const EVENT_PREVIEW_COUNT = 40;
export const EVENT_PREVIEW_CHARS = 2000;

export interface AgentDiagnostic {
	code: string;
	message: string;
	path: string | undefined;
	severity: "info" | "warning" | "error";
}

export interface LibraryOptions {
	sources: LibrarySource[];
	query: string | undefined;
	projectAgents: ProjectAgentsPolicy;
}

export interface AgentConfig {
	name: string;
	ref: string;
	description: string;
	tools: string[] | undefined;
	model: string | undefined;
	thinking: Exclude<ThinkingLevel, "inherit"> | undefined;
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
	projectAgents: ProjectAgentsPolicy;
}

export interface ExtensionToolProvenanceSpec {
	source: string;
	scope: ExtensionSourceScope | undefined;
	origin: ExtensionSourceOrigin | undefined;
}

export interface ExtensionToolGrantSpec {
	name: string;
	from: ExtensionToolProvenanceSpec;
}

export interface ExtensionToolPolicy {
	projectExtensions: ExtensionToolTrustPolicy;
	localExtensions: ExtensionToolTrustPolicy;
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

export interface InvocationAgentSpec {
	id: string;
	kind: InvocationAgentKind;
	ref: string | undefined;
	description: string | undefined;
	system: string | undefined;
	tools: string[] | undefined;
	extensionTools: ExtensionToolGrantSpec[] | undefined;
	model: string | undefined;
	thinking: ThinkingLevel | undefined;
	cwd: string | undefined;
	outputContract: string | undefined;
}

export interface ResolvedAgent {
	id: string;
	ref: string;
	name: string;
	kind: InvocationAgentKind;
	description: string;
	tools: string[];
	extensionTools: ResolvedExtensionToolGrant[];
	model: string | undefined;
	thinking: ThinkingLevel | undefined;
	systemPrompt: string;
	source: AgentSource;
	filePath: string | undefined;
	sha256: string | undefined;
	cwd: string | undefined;
	outputContract: string | undefined;
}

export interface TeamStepSpec {
	id: string;
	agent: string;
	task: string;
	needs: string[];
	cwd: string | undefined;
	outputContract: string | undefined;
	allowFailedDependencies: boolean;
	synthesis: boolean;
}

export interface TeamSynthesisSpec {
	id: string | undefined;
	agent: string | undefined;
	from: string[] | undefined;
	task: string;
	allowPartial: boolean | undefined;
	outputContract: string | undefined;
}

export interface TeamLimits {
	concurrency: number;
	timeoutSecondsPerStep: number;
}

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface TeamEvent {
	type: "tool" | "text" | "diagnostic";
	label: string;
	preview: string;
	status: "running" | "done" | "error" | undefined;
}

export interface FailureProvenance {
	likelyRoot: string;
	status: AgentStatus;
	exitCode: number | undefined;
	exitSignal: string | undefined;
	timedOut: boolean;
	aborted: boolean;
	failureTerminated: boolean;
	closeout: string;
	stopReason: string | undefined;
	malformedStdout: boolean;
	sawAssistantMessageEnd: boolean;
	protocolTerminal: boolean;
	lateEventsIgnored: boolean;
	firstObserved: string;
}

export interface StepAssistantOutput {
	disposition: "inline" | "file";
	chars: number;
	thresholdChars: number;
	inlineText: string | undefined;
	filePath: string | undefined;
}

export interface AgentRunResult {
	id: string;
	agent: string;
	agentName: string;
	agentRef: string;
	agentSource: AgentSource;
	task: string;
	cwd: string;
	needs: string[];
	status: AgentStatus;
	exitCode: number | undefined;
	exitSignal: string | undefined;
	assistantOutput: StepAssistantOutput;
	stderr: string;
	stderrTruncated: boolean;
	events: TeamEvent[];
	eventsTruncated: boolean;
	usage: UsageStats;
	model: string | undefined;
	stopReason: string | undefined;
	errorMessage: string | undefined;
	failureCause: string | undefined;
	failureProvenance: FailureProvenance | undefined;
	timedOut: boolean;
	malformedStdout: boolean;
	sawAssistantMessageEnd: boolean;
	protocolTerminal: boolean;
	lateEventsIgnored: boolean;
	synthesis: boolean;
}

export interface CatalogAgentSummary {
	name: string;
	ref: string;
	source: Exclude<AgentSource, "inline">;
	description: string;
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

export interface PublicExtensionToolGrant {
	name: string;
	description: string | undefined;
	from: ResolvedExtensionSource;
}

export interface PublicResolvedAgent {
	id: string;
	ref: string;
	name: string;
	kind: InvocationAgentKind;
	description: string;
	tools: string[];
	extensionTools: PublicExtensionToolGrant[];
	model: string | undefined;
	thinking: ThinkingLevel | undefined;
	source: AgentSource;
	filePath: string | undefined;
	sha256: string | undefined;
	cwd: string | undefined;
	outputContract: string | undefined;
}

export interface AgentTeamDetails {
	kind: "agent_team";
	action: AgentTeamAction;
	objective: string | undefined;
	library: LibraryOptions;
	catalog: CatalogAgentSummary[];
	extensionTools: CatalogExtensionToolSummary[];
	agents: PublicResolvedAgent[];
	steps: AgentRunResult[];
	diagnostics: AgentDiagnostic[];
	fullOutputPath: string | undefined;
}

export interface TextBlock {
	type: "text";
	text: string;
}

export interface ToolCallBlock {
	type: "toolCall";
	name: string;
	arguments: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolCallBlock;

export interface AgentMessageLike {
	role: string;
	content: ContentBlock[];
	usage: UsageStats | undefined;
	model: string | undefined;
	stopReason: string | undefined;
	errorMessage: string | undefined;
}

export interface AgentInvocationDefaults {
	model: string | undefined;
	thinking: string | undefined;
}

export function createEmptyUsage(): UsageStats {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		contextTokens: 0,
		turns: 0,
	};
}

export function isAgentTeamDetails(value: unknown): value is AgentTeamDetails {
	return isRecord(value) && value.kind === "agent_team" && typeof value.action === "string";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
