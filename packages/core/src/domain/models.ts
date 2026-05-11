export type ChangeStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "archived";

export type SpecScope = "change" | "product";
export type SpecSyncStatus = "synced" | "pending" | "failed";
export type SpecReviewStatus =
  | "not_in_review"
  | "pending"
  | "changes_requested"
  | "approved";

export type SnapshotType = "working" | "baseline";
export type ReviewSessionStatus = "active" | "completed" | "superseded";
export type ReviewerStatus = "pending" | "approved" | "changes_requested";
export type CommentStatus = "open" | "resolved";
export type UserStatus = "active" | "disabled";
export type GlobalRole = "platform_admin";
export type ProjectRole = "project_admin" | "pm" | "reviewer" | "viewer";

export interface ProjectMembership {
  project_id: string;
  project_role: ProjectRole;
}

export interface User {
  _id: string;
  username: string;
  email?: string;
  display_name: string;
  password_hash: string;
  global_roles: GlobalRole[];
  memberships: ProjectMembership[];
  status: UserStatus;
  token_version: number;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedUser {
  _id: string;
  username: string;
  email?: string;
  display_name: string;
  global_roles: GlobalRole[];
  memberships: ProjectMembership[];
  token_version: number;
}

export interface ProjectRepoBinding {
  repo: string;
  default_branch: string;
}

export interface Project {
  _id: string;
  slug: string;
  name: string;
  description: string | null;
  repo_bindings: ProjectRepoBinding[];
  default_reviewers: ReviewerConfig[];
  is_default: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepoBinding {
  type: "repo";
  repo: string;
  branch: string;
  change_name: string;
}

export interface UrlLink {
  type: "url";
  url: string;
  label?: string;
}

export type LinkedAsset = RepoBinding | UrlLink;

/** @deprecated Use LinkedAsset instead. Kept for backward compatibility. */
export type RepoChangeBinding = RepoBinding;

export interface Change {
  _id: string;
  project_id: string;
  title: string;
  description: string;
  status: ChangeStatus;
  prd_link: string | null;
  repo_changes: LinkedAsset[];
  current_review_session_id: string | null;
  review_required: boolean;
  sprint: string | null;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  source_kind?: "runtime" | "seed" | "sc_import";
  source_key?: string;
}

export interface SpecUnit {
  _id: string;
  project_id: string;
  scope: SpecScope;
  change_id: string | null;
  capability: string;
  repo: string;
  branch: string;
  change_name: string | null;
  path: string;
  owner_role: string;
  working_snapshot_id: string | null;
  sync_status: SpecSyncStatus;
  review_status: SpecReviewStatus | null;
  last_synced_at: string | null;
  new_version_available?: boolean;
  source_kind?: "runtime" | "seed" | "sc_import";
  source_key?: string;
}

export interface Snapshot {
  _id: string;
  spec_id: string;
  content: string;
  content_hash: string;
  type: SnapshotType;
  source: {
    repo: string;
    branch: string;
    commit_sha: string;
    collected_at: string;
  };
  created_at: string;
  source_kind?: "runtime" | "seed" | "sc_import";
  source_key?: string;
}

export interface ReviewBaseline {
  spec_id: string;
  snapshot_id: string;
  product_spec_id: string | null;
  product_spec_snapshot_id: string | null;
}

export interface ReviewerConfig {
  user: string;
  role: string;
}

export interface SpecReviewRecord {
  spec_id: string;
  reviewer: string;
  status: ReviewerStatus;
  reviewed_at: string | null;
}

export interface ReviewerAssignment {
  user: string;
  role: string;
  assigned_specs: string[];
  status: ReviewerStatus;
}

export interface ReviewSession {
  _id: string;
  project_id: string;
  change_id: string;
  status: ReviewSessionStatus;
  baselines: ReviewBaseline[];
  reviewers: ReviewerAssignment[];
  spec_reviews: SpecReviewRecord[];
  approval_rule: "all_required";
  created_at: string;
  completed_at: string | null;
}

export interface CommentAnchor {
  type: "heading";
  heading_path: string;
  line_hint: number;
}

export interface Comment {
  _id: string;
  review_session_id: string;
  spec_id: string;
  snapshot_id: string;
  anchor: CommentAnchor;
  author: string;
  content: string;
  status: CommentStatus;
  thread_id: string;
  created_at: string;
}

export interface ApiToken {
  _id: string;
  user_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface SyncUploadPayload {
  project_id?: string | null;
  scope: SpecScope;
  change_id: string | null;
  capability: string;
  repo: string;
  branch: string;
  change_name: string | null;
  path: string;
  content: string;
  content_hash: string;
  commit_sha: string;
  collected_at: string;
}

export interface CenterStore {
  projects: Project[];
  users: User[];
  changes: Change[];
  specUnits: SpecUnit[];
  snapshots: Snapshot[];
  reviewSessions: ReviewSession[];
  comments: Comment[];
}

export interface OverviewMetrics {
  totalChanges: number;
  reviewQueue: number;
  productSpecs: number;
  openComments: number;
  readyToArchive: number;
}

export interface ChangeDashboardEntry {
  change: Change;
  spec_count: number;
  repos: string[];
  reviewer_users: string[];
  review_progress: {
    approved: number;
    total: number;
    pending: number;
  };
  open_comment_count: number;
  new_version_count: number;
  blocker_count: number;
  blocker_labels: string[];
  last_synced_at: string | null;
  cross_spec_issue_count: number;
  recommendation_count: number;
}

export interface ChangeDashboardSummary {
  active_change_count: number;
  blocked_change_count: number;
  in_review_count: number;
  approved_change_count: number;
  total_open_comments: number;
}

export interface ReviewerRecommendation {
  user: string;
  role: string;
  score: number;
  rationale: string;
}

export interface SearchResult {
  kind: "change" | "product_spec" | "review_session";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  matchSnippet?: string;
  score?: number;
}

export interface ProductKnowledgeEntry {
  change_id: string;
  title: string;
  status: ChangeStatus;
  updated_at: string;
  note: string;
}

export type EmbeddingTaskStatus = "pending" | "processing" | "done" | "failed";

export interface EmbeddingTask {
  _id: string;
  doc_type: "snapshot" | "change" | "comment";
  doc_id: string;
  project_id: string;
  status: EmbeddingTaskStatus;
  error?: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface RagChunk {
  chunk_id: string;
  project_id: string;
  doc_type: "snapshot" | "change" | "comment";
  doc_id: string;
  spec_id?: string;
  change_id?: string;
  capability?: string;
  heading_path: string;
  content: string;
  chunk_index: number;
}

export interface RagSource {
  type: "spec" | "change" | "comment";
  title: string;
  href: string;
  project_id: string;
  project_name: string;
}

export interface RagQueryResult {
  answer: string;
  sources: RagSource[];
}

export interface ConversationAgentStep {
  type: "tool_call" | "tool_result" | "thinking";
  name?: string;
  args?: Record<string, unknown>;
  summary?: string;
  content?: string;
}

export interface ConversationToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ConversationToolResult {
  tool_call_id: string;
  content: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
  agent_steps?: ConversationAgentStep[];
  /** Structured tool calls made by the assistant in this turn */
  tool_calls?: ConversationToolCall[];
  /** Structured tool results received during this turn */
  tool_results?: ConversationToolResult[];
  created_at: string;
}

export interface Conversation {
  _id: string;
  project_id: string;
  user_id: string;
  title: string;
  messages: ConversationMessage[];
  /** LLM-generated summary of earlier conversation turns (for context compaction) */
  summary?: string;
  /** Number of messages covered by the summary */
  summary_up_to?: number;
  /** Estimated total tokens across all messages */
  total_tokens_estimate?: number;
  created_at: string;
  updated_at: string;
}

export type AgentTaskStatus = "running" | "done" | "error";

export interface AgentTaskEvent {
  seq: number;
  type: "token" | "sources" | "tool_call" | "tool_result"
      | "thinking" | "context_usage" | "summary_updated" | "error" | "done";
  data: Record<string, unknown>;
  created_at: string;
}

export interface AgentTask {
  _id: string;
  conversation_id: string;
  user_id: string;
  project_ids: string[];
  query: string;
  status: AgentTaskStatus;
  events: AgentTaskEvent[];
  full_answer: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export type AITraceStatus = "running" | "completed" | "error" | "timeout";
export type AISpanType =
  | "llm"
  | "tool"
  | "rag_retrieval"
  | "embedding"
  | "query_rewrite"
  | "summary";
export type AISpanStatus = "ok" | "error";

export interface AITraceContextCompaction {
  level: "none" | "L1" | "L2" | "summary";
  originalTokens: number;
  compactedTokens: number;
}

export interface AITraceClientMetrics {
  ttftMs?: number;
  streamDurationMs?: number;
  completed?: boolean;
}

export interface AITrace {
  _id: string;
  traceId: string;
  conversationId: string;
  taskId: string;
  projectIds: string[];
  userId?: string;
  model: string;
  totalDurationMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  estimatedCostUsd?: number;
  agentRounds: number;
  toolCallCount: number;
  ragChunkCount: number;
  status: AITraceStatus;
  error?: string;
  contextCompaction?: AITraceContextCompaction;
  clientMetrics?: AITraceClientMetrics;
  createdAt: string;
  completedAt?: string;
}

export interface AISpanLlmDetail {
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
  reasoningEffort?: string;
  streaming: boolean;
  firstTokenMs?: number;
}

export interface AISpanToolDetail {
  toolName: string;
  args: Record<string, unknown>;
  resultChars: number;
  resultTruncated: boolean;
}

export interface AISpanRagDetail {
  originalQuery: string;
  rewrittenQuery?: string;
  resultCount: number;
  scores: number[];
  embeddingDurationMs: number;
  searchDurationMs: number;
  rerankModel?: string;
  rerankDurationMs?: number;
  preRerankCount?: number;
  postRerankScores?: number[];
}

export interface AISpan {
  _id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  type: AISpanType;
  name: string;
  startTime: string;
  durationMs: number;
  status: AISpanStatus;
  error?: string;
  llm?: AISpanLlmDetail;
  tool?: AISpanToolDetail;
  rag?: AISpanRagDetail;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Evaluation system
// ---------------------------------------------------------------------------

export interface EvalExpected {
  keywords?: string[];
  tools_used?: string[];
  max_rounds?: number;
  should_not_contain?: string[];
  reference_answer?: string;
}

export interface EvalExample {
  id: string;
  category: string;
  input: string;
  context?: { projectIds: string[] };
  expected?: EvalExpected;
}

export type EvalLabel = "pass" | "fail" | "partial";

export interface EvalResult {
  evaluator: string;
  score: number;
  label: EvalLabel;
  reason?: string;
  details?: Record<string, unknown>;
}

export type EvalRunStatus = "running" | "completed" | "failed";

export interface EvalRunProgress {
  completedExamples: number;
  totalExamples: number;
  currentEvaluator?: string;
  startedAt: string;
}

export interface EvalRun {
  _id: string;
  runId: string;
  runAt: string;
  datasetVersion: string;
  model: string;
  totalExamples: number;
  passRate: number;
  avgScore: number;
  byCategory: Record<string, { count: number; avgScore: number; passRate: number }>;
  byEvaluator: Record<string, { avgScore: number; passRate: number }>;
  status?: EvalRunStatus;
  progress?: EvalRunProgress;
  error?: string;
  createdAt: string;
}

export interface EvalDataset {
  _id: string;
  name: string;
  category: string;
  description?: string;
  examples: EvalExample[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface EvalConfigEvaluatorEntry {
  name: string;
  enabled: boolean;
  params?: Record<string, number | string | boolean>;
}

export interface EvalConfig {
  _id: string;
  evaluators: EvalConfigEvaluatorEntry[];
  defaultPassThreshold: number;
  updatedAt: string;
  updatedBy: string;
}

export interface EvalResultDoc {
  _id: string;
  runId: string;
  exampleId: string;
  category: string;
  evaluator: string;
  score: number;
  label: EvalLabel;
  reason?: string;
  traceId?: string;
  agentOutput?: string;
  durationMs: number;
  createdAt: string;
}
