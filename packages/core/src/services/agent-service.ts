import type OpenAI from "openai";
import { ensureCollection, searchPoints } from "../data/qdrant";
import type { RagSource } from "../domain/models";
import {
  getChange,
  getSpec,
  getSnapshot,
  listSpecsForChange,
  searchCenter,
  getSpecIssues,
  getCrossSpecIssues,
  getReviewBrief,
  getComments,
  getCurrentReviewSessionForChange,
  getBaselineContext,
  getOverviewMetrics,
  getChangeDashboardSummary
} from "./center-service";
import {
  buildManagedMessages,
  compactWithSummary,
  estimateTokens,
  type StructuredHistoryMessage,
  type ContextManagerConfig,
  type ContextUsageSnapshot,
  getModelLimits
} from "./context-manager";
import {
  embedText,
  getChatModel,
  getAIClient,
  isRerankEnabled,
  rerankDocuments,
  type ChatHistoryMessage
} from "./rag-service";
import type { AITraceCollector } from "./ai-trace-collector";
import { createId } from "../utils/id";
import { createLogger } from "../utils/logger";

const logger = createLogger("agent-service");

const COLLECTION = "sc_chunks";
const MAX_AGENT_ROUNDS = 20;
const MAX_TOOL_RESULT_CHARS = 80_000;
const AGENT_TIMEOUT_MS = 300_000;
const CHUNK_TIMEOUT_MS = 30_000;
const CREATE_TIMEOUT_MS = 30_000;

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

function getReasoningEffort(): ReasoningEffort | undefined {
  const val = (process.env.AI_REASONING_EFFORT ?? process.env.OPENROUTER_REASONING_EFFORT)?.trim().toLowerCase();
  if (!val || val === "default") return undefined;
  const valid: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];
  return valid.includes(val as ReasoningEffort) ? (val as ReasoningEffort) : undefined;
}

export interface EmbeddingCache {
  get(text: string): number[] | undefined;
  set(text: string, vector: number[]): void;
}

export interface AgentToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, string>, projectIds: string[]) => Promise<string>;
}

export interface AgentStreamEvent {
  type: "token" | "sources" | "tool_call" | "tool_result" | "thinking" | "context_usage" | "summary_updated";
  content?: string;
  items?: RagSource[];
  name?: string;
  args?: Record<string, unknown>;
  summary?: string;
  context_usage?: {
    used: number;
    total: number;
    percent: number;
    breakdown: { system: number; history: number; currentTurn: number; reservedOutput: number };
    source: "estimate" | "actual";
    modelName?: string;
    compactionLevel: number;
    droppedTurns: number;
  };
  /** Updated conversation summary after pre-compaction summarization */
  updatedSummary?: string;
}

const AGENT_SYSTEM_PROMPT = `你是 Spec Center 的 Agent 助手，结合检索到的文档片段与可调用的工具，帮助用户分析 Change、Spec 与实现风险。

分析框架（按需使用）：
1) 对接风险分析：API 契约是否对齐（路径、方法、字段名与类型、必填/可选、默认值）；请求/响应与错误码；幂等与重试；状态机与异步回调；版本兼容与弃用策略。
2) 完整性检查：需求与 Spec 是否覆盖场景、边界、异常与观测；跨 Spec 是否遗漏依赖或验收标准。调用 detect_spec_issues 检测单个 Spec 质量问题，调用 detect_cross_spec_issues 检测跨 Spec 一致性问题。
3) 一致性校验：术语与数据模型命名是否统一；同一实体在不同文档中的定义是否冲突；与 RAG 片段及工具拉取的内容对照。
4) 评审辅助：使用 get_review_brief 获取评审简报；使用 get_review_comments 查看评审意见；使用 get_baseline_context 对比 baseline 与当前版本。

工具使用策略（重要——减少轮次）：
- 每次回复尽量一次性调用所有需要的工具，不要一个一个试探。例如需要查 3 个 Spec 就一次发起 3 个 get_spec_content 调用。
- search_specs 返回结果后，如果需要读取多个 Spec 内容，在同一轮全部调用 get_spec_content，不要分多轮逐个读取。
- 当用户询问风险或问题时，优先调用 detect_spec_issues / detect_cross_spec_issues，而非从原文自行推理。
- 需要了解项目整体状态时，调用 get_project_overview 获取宏观数据。
- 通常 2-3 轮工具调用即可收集足够信息，尽快生成最终回答。

规则：
- 优先基于工具与 RAG 片段作答，避免臆测；不确定时说明依据不足。
- 回答中用 [来源X] 引用 RAG 片段编号（若有）。
- 使用 Markdown 组织回答。`;

export function truncateToTokenLimit(text: string, limit: number): string {
  let estimated = 0;
  for (const ch of text) {
    estimated += ch.codePointAt(0)! <= 127 ? 0.25 : 0.5;
  }
  if (estimated <= limit) {
    return text;
  }
  const estimatedTotal = Math.round(estimated);
  let acc = 0;
  let cut = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    acc += c.codePointAt(0)! <= 127 ? 0.25 : 0.5;
    if (acc >= limit) {
      cut = i + 1;
      break;
    }
  }
  return (
    text.slice(0, cut) +
    `\n\n[内容已截取，原文约 ${estimatedTotal} tokens，已展示约 ${limit} tokens]`
  );
}

/**
 * Build the initial LLM message array with token-aware context management.
 * Delegates to the centralized context manager for history trimming and compaction.
 */
export function buildAgentMessages(
  query: string,
  chunks: Array<{ content: string; heading_path: string; source_label: string }>,
  history?: ChatHistoryMessage[] | StructuredHistoryMessage[],
  conversationSummary?: string,
  contextConfig?: ContextManagerConfig
): { messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]; usage: ContextUsageSnapshot; droppedMessages: StructuredHistoryMessage[] } {
  const structuredHistory: StructuredHistoryMessage[] = (history ?? []).map((m) => {
    if ("tool_calls" in m || "tool_call_id" in m || m.role === "tool") {
      return m as StructuredHistoryMessage;
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  });

  const { messages, usage, droppedMessages } = buildManagedMessages(
    AGENT_SYSTEM_PROMPT,
    query,
    chunks,
    structuredHistory,
    conversationSummary,
    contextConfig
  );

  return { messages, usage, droppedMessages };
}

export { AGENT_SYSTEM_PROMPT };

export function buildToolDefinitions(
  tools: AgentToolDef[]
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}

function toStringArgs(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function projectSetOk(projectIds: string[], projectId: string): boolean {
  return projectIds.includes(projectId);
}

export function createGetChangeTool(): AgentToolDef {
  return {
    name: "get_change",
    description:
      "按 Change ID 获取变更详情，并列出该变更下关联的 Spec 概要。",
    parameters: {
      type: "object",
      properties: {
        change_id: { type: "string", description: "Change ID，例如 CHG-2026-00123" }
      },
      required: ["change_id"]
    },
    execute: async (args, projectIds) => {
      const changeId = args.change_id ?? "";
      const change = await getChange(changeId);
      if (!change) {
        return JSON.stringify({ error: "未找到该 Change" });
      }
      if (!projectSetOk(projectIds, change.project_id)) {
        return JSON.stringify({ error: "无权访问该 Change（项目不匹配）" });
      }
      const specs = await listSpecsForChange(changeId);
      const payload = {
        change: {
          _id: change._id,
          project_id: change.project_id,
          title: change.title,
          description: change.description,
          status: change.status,
          sprint: change.sprint,
          prd_link: change.prd_link,
          review_required: change.review_required,
          created_by: change.created_by,
          created_at: change.created_at,
          updated_at: change.updated_at
        },
        specs: specs.map((s) => ({
          spec_id: s._id,
          capability: s.capability,
          owner_role: s.owner_role,
          sync_status: s.sync_status
        }))
      };
      return JSON.stringify(payload);
    }
  };
}

export function createGetSpecContentTool(): AgentToolDef {
  return {
    name: "get_spec_content",
    description: "读取指定 Spec 当前工作快照的 Markdown 正文（有长度截断）。",
    parameters: {
      type: "object",
      properties: {
        spec_id: { type: "string", description: "Spec 单元 ID" }
      },
      required: ["spec_id"]
    },
    execute: async (args, projectIds) => {
      const specId = args.spec_id ?? "";
      const spec = await getSpec(specId);
      if (!spec) {
        return "错误：未找到该 Spec";
      }
      if (!projectSetOk(projectIds, spec.project_id)) {
        return "错误：无权访问该 Spec（项目不匹配）";
      }
      if (!spec.working_snapshot_id) {
        return "错误：该 Spec 尚无工作快照";
      }
      const snap = await getSnapshot(spec.working_snapshot_id);
      if (!snap) {
        return "错误：未找到工作快照内容";
      }
      const header = `# ${spec.capability}\n\n_repo ${spec.repo} · ${spec.path}_\n\n`;
      return truncateToTokenLimit(header + snap.content, 4000);
    }
  };
}

export function createDetectSpecIssuesTool(): AgentToolDef {
  return {
    name: "detect_spec_issues",
    description: "检测单个 Spec 的质量问题（缺失、模糊、不完整、回归风险等）。",
    parameters: {
      type: "object",
      properties: {
        spec_id: { type: "string", description: "Spec 单元 ID" }
      },
      required: ["spec_id"]
    },
    execute: async (args, projectIds) => {
      const specId = args.spec_id ?? "";
      const spec = await getSpec(specId);
      if (!spec) {
        return JSON.stringify({ error: "未找到该 Spec" });
      }
      if (!projectSetOk(projectIds, spec.project_id)) {
        return JSON.stringify({ error: "无权访问该 Spec（项目不匹配）" });
      }
      try {
        const issues = await getSpecIssues(specId);
        return JSON.stringify({ spec_id: specId, capability: spec.capability, issues });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "检测失败" });
      }
    }
  };
}

export function createDetectCrossSpecIssuesTool(): AgentToolDef {
  return {
    name: "detect_cross_spec_issues",
    description: "检测一个 Change 下多个 Spec 之间的一致性问题。",
    parameters: {
      type: "object",
      properties: {
        change_id: { type: "string", description: "Change ID" }
      },
      required: ["change_id"]
    },
    execute: async (args, projectIds) => {
      const changeId = args.change_id ?? "";
      const change = await getChange(changeId);
      if (!change) {
        return JSON.stringify({ error: "未找到该 Change" });
      }
      if (!projectSetOk(projectIds, change.project_id)) {
        return JSON.stringify({ error: "无权访问该 Change（项目不匹配）" });
      }
      try {
        const issues = await getCrossSpecIssues(changeId);
        return JSON.stringify({ change_id: changeId, issues });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "检测失败" });
      }
    }
  };
}

export function createGetReviewBriefTool(): AgentToolDef {
  return {
    name: "get_review_brief",
    description: "获取指定 Spec 的评审简报（风险、重点关注、关键变更等）。",
    parameters: {
      type: "object",
      properties: {
        spec_id: { type: "string", description: "Spec 单元 ID" }
      },
      required: ["spec_id"]
    },
    execute: async (args, projectIds) => {
      const specId = args.spec_id ?? "";
      const spec = await getSpec(specId);
      if (!spec) {
        return JSON.stringify({ error: "未找到该 Spec" });
      }
      if (!projectSetOk(projectIds, spec.project_id)) {
        return JSON.stringify({ error: "无权访问该 Spec（项目不匹配）" });
      }
      try {
        const brief = await getReviewBrief(specId);
        return JSON.stringify({ spec_id: specId, capability: spec.capability, brief });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "获取简报失败" });
      }
    }
  };
}

export function createGetReviewCommentsTool(): AgentToolDef {
  return {
    name: "get_review_comments",
    description: "获取 Change 当前活跃评审会话的评论。可选按 Spec 过滤。",
    parameters: {
      type: "object",
      properties: {
        change_id: { type: "string", description: "Change ID" },
        spec_id: { type: "string", description: "可选，只查看某个 Spec 的评论" }
      },
      required: ["change_id"]
    },
    execute: async (args, projectIds) => {
      const changeId = args.change_id ?? "";
      const change = await getChange(changeId);
      if (!change) {
        return JSON.stringify({ error: "未找到该 Change" });
      }
      if (!projectSetOk(projectIds, change.project_id)) {
        return JSON.stringify({ error: "无权访问该 Change（项目不匹配）" });
      }
      const session = await getCurrentReviewSessionForChange(changeId);
      if (!session) {
        return JSON.stringify({ message: "该 Change 当前无活跃评审会话" });
      }
      const specId = args.spec_id;
      if (specId) {
        const comments = await getComments(session._id, specId);
        return JSON.stringify({ session_id: session._id, spec_id: specId, comments: comments.map(formatComment) });
      }
      const allComments: Array<{ spec_id: string; author: string; content: string; status: string; created_at: string }> = [];
      for (const baseline of session.baselines) {
        const comments = await getComments(session._id, baseline.spec_id);
        for (const c of comments) {
          allComments.push(formatComment(c));
        }
      }
      return JSON.stringify({ session_id: session._id, total: allComments.length, comments: allComments });
    }
  };
}

function formatComment(c: { author: string; content: string; status: string; spec_id: string; created_at: string }) {
  return { spec_id: c.spec_id, author: c.author, content: c.content, status: c.status, created_at: c.created_at };
}

export function createGetBaselineContextTool(): AgentToolDef {
  return {
    name: "get_baseline_context",
    description: "获取评审会话中某个 Spec 的 baseline vs working 上下文，用于版本对比分析。",
    parameters: {
      type: "object",
      properties: {
        change_id: { type: "string", description: "Change ID" },
        spec_id: { type: "string", description: "Spec 单元 ID" }
      },
      required: ["change_id", "spec_id"]
    },
    execute: async (args, projectIds) => {
      const changeId = args.change_id ?? "";
      const specId = args.spec_id ?? "";
      const change = await getChange(changeId);
      if (!change) {
        return JSON.stringify({ error: "未找到该 Change" });
      }
      if (!projectSetOk(projectIds, change.project_id)) {
        return JSON.stringify({ error: "无权访问该 Change（项目不匹配）" });
      }
      const session = await getCurrentReviewSessionForChange(changeId);
      if (!session) {
        return JSON.stringify({ error: "该 Change 当前无活跃评审会话" });
      }
      try {
        const ctx = await getBaselineContext(session._id, specId);
        const result: Record<string, unknown> = {
          spec_id: specId,
          spec_capability: ctx.spec?.capability ?? null
        };
        if (ctx.delta) {
          result.delta_content = truncateToTokenLimit(ctx.delta.content, 3000);
        }
        if (ctx.productBaseline) {
          result.product_baseline_content = truncateToTokenLimit(ctx.productBaseline.content, 3000);
        }
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "获取 baseline 上下文失败" });
      }
    }
  };
}

export function createGetProjectOverviewTool(): AgentToolDef {
  return {
    name: "get_project_overview",
    description: "获取项目宏观数据：Change 总数、评审队列、Product Spec 数量、各状态分布等。",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "项目 ID；缺省时使用当前上下文项目" }
      },
      required: []
    },
    execute: async (args, projectIds) => {
      const pid = args.project_id ?? (projectIds.length === 1 ? projectIds[0] : undefined);
      if (pid && !projectSetOk(projectIds, pid)) {
        return JSON.stringify({ error: "无权访问该项目" });
      }
      try {
        const [metrics, summary] = await Promise.all([
          getOverviewMetrics(pid),
          getChangeDashboardSummary(pid)
        ]);
        return JSON.stringify({ metrics, dashboard: summary });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "获取项目概况失败" });
      }
    }
  };
}

export function createSearchSpecsTool(): AgentToolDef {
  return {
    name: "search_specs",
    description: "在 Center 全文索引中搜索 Change、Spec、评审相关条目。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词或短语" },
        project_id: {
          type: "string",
          description: "可选；缺省时使用当前上下文项目"
        }
      },
      required: ["query"]
    },
    execute: async (args, projectIds) => {
      const q = (args.query ?? "").trim();
      if (!q) {
        return "错误：query 不能为空";
      }
      const pid = args.project_id ?? (projectIds.length === 1 ? projectIds[0] : undefined);
      const results = await searchCenter(q, pid);
      const lines = results.map(
        (r) =>
          `- [${r.kind}] ${r.title} (${r.subtitle})\n  ${r.href}${r.matchSnippet ? `\n  片段: ${r.matchSnippet}` : ""}`
      );
      const body = lines.join("\n");
      return truncateToTokenLimit(body || "（无匹配结果）", 4000);
    }
  };
}

export function createVectorSearchTool(embeddingCache?: EmbeddingCache): AgentToolDef {
  return {
    name: "vector_search",
    description: "在向量库中按语义检索与问题相关的文档块。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "用于向量检索的自然语言问题" }
      },
      required: ["query"]
    },
    execute: async (args, projectIds) => {
      const q = (args.query ?? "").trim();
      if (!q) {
        return "错误：query 不能为空";
      }
      if (projectIds.length === 0) {
        return "错误：未指定可检索的项目";
      }
      try {
        const cached = embeddingCache?.get(q);
        const vector = cached ?? await embedText(q);
        if (!cached && embeddingCache) embeddingCache.set(q, vector);
        if (cached) {
          logger.info({ event: "embedding-cache-hit", source: "vector_search" }, "Embedding cache hit");
        }
        await ensureCollection(COLLECTION, vector.length);
        const filter =
          projectIds.length === 1
            ? { must: [{ key: "project_id", match: { value: projectIds[0] } }] }
            : { must: [{ key: "project_id", match: { any: projectIds } }] };
        const rerankEnabled = isRerankEnabled();
        let hits = await searchPoints(COLLECTION, vector, filter, rerankEnabled ? 20 : 8);
        if (hits.length === 0) {
          return "（向量检索无结果）";
        }

        if (rerankEnabled && hits.length > 0) {
          const docs = hits.map((h) => (h.payload.content as string) ?? "");
          const reranked = await rerankDocuments(q, docs, 8);
          if (reranked) {
            hits = reranked.map((r) => hits[r.index]);
          } else {
            hits = hits.slice(0, 8);
          }
        }

        const lines = hits.map((h, i) => {
          const cap = (h.payload.capability as string) ?? "";
          const hp = (h.payload.heading_path as string) ?? "";
          const doc = (h.payload.doc_id as string) ?? "";
          const text = (h.payload.content as string) ?? "";
          return `[${i + 1}] score=${h.score.toFixed(4)} ${cap || doc}${hp ? ` > ${hp}` : ""}\n${text}`;
        });
        return lines.join("\n\n---\n\n");
      } catch {
        return "错误：向量检索暂不可用或集合未就绪";
      }
    }
  };
}

export function buildAgentTools(embeddingCache?: EmbeddingCache): AgentToolDef[] {
  return [
    createGetChangeTool(),
    createGetSpecContentTool(),
    createSearchSpecsTool(),
    createVectorSearchTool(embeddingCache),
    createDetectSpecIssuesTool(),
    createDetectCrossSpecIssuesTool(),
    createGetReviewBriefTool(),
    createGetReviewCommentsTool(),
    createGetBaselineContextTool(),
    createGetProjectOverviewTool()
  ];
}

/**
 * Enforce a character budget on tool result messages within the current agent loop.
 * Compacts oldest tool results first (single pass), preserving recent ones.
 */
function enforceToolResultBudget(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  maxTotal: number
): void {
  const COMPACTED_PREFIX = "[已折叠:";
  const toolEntries: Array<{ idx: number; msg: OpenAI.Chat.Completions.ChatCompletionToolMessageParam }> = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "tool") {
      toolEntries.push({ idx: i, msg: m as OpenAI.Chat.Completions.ChatCompletionToolMessageParam });
    }
  }

  let total = 0;
  for (const { msg } of toolEntries) {
    const c = msg.content;
    total += typeof c === "string" ? c.length : JSON.stringify(c).length;
  }
  if (total <= maxTotal) return;

  for (const entry of toolEntries) {
    if (total <= maxTotal) break;
    const raw = typeof entry.msg.content === "string"
      ? entry.msg.content
      : JSON.stringify(entry.msg.content);
    if (raw.startsWith(COMPACTED_PREFIX)) continue;
    const preview = raw.slice(0, 120).replace(/\n/g, " ");
    const compacted = `${COMPACTED_PREFIX} ${raw.length} 字符] ${preview}…`;
    total -= raw.length;
    total += compacted.length;
    entry.msg.content = compacted;
  }
}

function buildThinkingSummary(
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
): string {
  const parts = toolCalls.map((tc) => {
    const name = tc.type === "function" ? tc.function.name : tc.type;
    let detail = "";
    try {
      const raw = tc.type === "function" ? tc.function.arguments ?? "{}" : "{}";
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      detail = Object.keys(parsed).length ? JSON.stringify(parsed) : "";
    } catch {
      detail = "";
    }
    return detail ? `${name}(${detail})` : name;
  });
  return `工具计划：${parts.join(" → ")}`;
}

function* yieldTextAsTokens(text: string): Generator<AgentStreamEvent> {
  const step = 32;
  for (let i = 0; i < text.length; i += step) {
    yield { type: "token", content: text.slice(i, i + step) };
  }
}

export async function* queryAgentStream(
  query: string,
  projectIds: string[],
  ragChunks: Array<{ content: string; heading_path: string; source_label: string }>,
  history?: ChatHistoryMessage[] | StructuredHistoryMessage[],
  sourceItems: RagSource[] = [],
  queryVector?: number[],
  conversationSummary?: string,
  collector?: AITraceCollector
): AsyncGenerator<AgentStreamEvent> {
  const totalStart = performance.now();
  const client = getAIClient();
  const model = getChatModel();

  const embeddingCache: EmbeddingCache = new Map<string, number[]>();
  if (queryVector) embeddingCache.set(query, queryVector);

  const tools = buildAgentTools(embeddingCache);
  const toolDefs = buildToolDefinitions(tools);
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  let cumulativeToolChars = 0;

  try {
    // Fetch dynamic model limits and inject into config
    const modelLimits = await getModelLimits(model);
    const contextConfig: ContextManagerConfig = {
      contextWindowTokens: modelLimits.contextWindow,
      reservedOutputTokens: modelLimits.maxOutput
    };

    // Two-pass compaction: if turns would be dropped, summarize them first via LLM
    const structuredHistory: StructuredHistoryMessage[] = (history ?? []).map((m) => {
      if ("tool_calls" in m || "tool_call_id" in m || (m as StructuredHistoryMessage).role === "tool") {
        return m as StructuredHistoryMessage;
      }
      return { role: (m as ChatHistoryMessage).role as "user" | "assistant", content: (m as ChatHistoryMessage).content };
    });

    const compactResult = await compactWithSummary(
      AGENT_SYSTEM_PROMPT,
      query,
      ragChunks,
      structuredHistory,
      conversationSummary,
      contextConfig
    );

    const { messages, usage } = compactResult;

    if (compactResult.updatedSummary && compactResult.updatedSummary !== conversationSummary) {
      yield { type: "summary_updated", updatedSummary: compactResult.updatedSummary };
    }

    usage.modelName = model;
    yield { type: "context_usage", context_usage: usage };

    const contextLimit = contextConfig.contextWindowTokens ?? 128_000;
    const maxPromptTokens = Math.floor(contextLimit * 0.9);

    let completedRounds = 0;
    let cumulativePromptTokens = 0;
    let cumulativeCompletionTokens = 0;
    let toolCallCount = 0;

    for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
      enforceToolResultBudget(messages, MAX_TOOL_RESULT_CHARS);

      const promptEstimate = messages.reduce((sum, m) => {
        const contentStr = typeof m.content === "string" ? m.content ?? "" : JSON.stringify(m.content ?? "");
        let tokens = estimateTokens(contentStr) + 4;
        if ("tool_calls" in m && Array.isArray(m.tool_calls)) {
          for (const tc of m.tool_calls) {
            if (tc.type === "function") {
              tokens += estimateTokens(tc.function.name) + estimateTokens(tc.function.arguments) + 8;
            }
          }
        }
        return sum + tokens;
      }, 0);

      if (round > 0 && promptEstimate > maxPromptTokens) {
        logger.warn(
          {
            round,
            event: "prompt-budget",
            promptEstimate,
            contextLimit,
            maxPromptTokens
          },
          "Prompt estimate exceeds 90% of context limit, stopping agent loop"
        );
        break;
      }

      const llmStartIso = new Date().toISOString();
      const llmStart = performance.now();
      let firstTokenMsThisRound: number | undefined;
      const reasoningEffort = getReasoningEffort();
      logger.info(
        {
          round,
          model,
          event: "llm-start",
          messageCount: messages.length,
          promptEstimateTokens: promptEstimate,
          reasoningEffort: reasoningEffort ?? "none"
        },
        "LLM call started"
      );

      const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & { reasoning?: { effort: string; exclude: boolean } } = {
        model,
        messages,
        tools: toolDefs,
        tool_choice: "auto",
        stream: true,
        stream_options: { include_usage: true }
      };
      if (reasoningEffort) {
        createParams.reasoning = { effort: reasoningEffort, exclude: true };
      }

      const createTimer = setTimeout(() => {
        logger.warn({ round, event: "create-timeout", timeoutMs: CREATE_TIMEOUT_MS }, "Create request timed out, aborting");
        controller.abort();
      }, CREATE_TIMEOUT_MS);

      let stream: Awaited<ReturnType<typeof client.chat.completions.create>>;
      try {
        stream = await client.chat.completions.create(
          createParams as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(createTimer);
      }

      let hasToolCalls = false;
      let firstTokenSeen = false;
      let streamContent = "";
      let streamUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
      const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

      let chunkTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const resetChunkTimeout = () => {
        if (chunkTimeoutId) clearTimeout(chunkTimeoutId);
        chunkTimeoutId = setTimeout(() => {
          logger.warn({ round, event: "chunk-timeout", timeoutMs: CHUNK_TIMEOUT_MS }, "Stream chunk timed out, aborting");
          controller.abort();
        }, CHUNK_TIMEOUT_MS);
      };

      resetChunkTimeout();
      try {
        for await (const chunk of stream) {
          resetChunkTimeout();

          if (chunk.usage) {
            streamUsage = {
              prompt_tokens: chunk.usage.prompt_tokens,
              completion_tokens: chunk.usage.completion_tokens,
              total_tokens: chunk.usage.total_tokens
            };
          }

          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          if (delta.tool_calls) {
            hasToolCalls = true;
            for (const tc of delta.tool_calls) {
              const existing = toolCallMap.get(tc.index);
              if (existing) {
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              } else {
                toolCallMap.set(tc.index, {
                  id: tc.id ?? "",
                  name: tc.function?.name ?? "",
                  arguments: tc.function?.arguments ?? ""
                });
              }
            }
          }

          if (delta.content) {
            if (!firstTokenSeen) {
              firstTokenSeen = true;
              firstTokenMsThisRound = Math.round(performance.now() - llmStart);
              logger.info(
                { round, event: "first-token", durationMs: firstTokenMsThisRound },
                "First token received"
              );
            }
            streamContent += delta.content;
            if (!hasToolCalls) {
              yield { type: "token", content: delta.content };
            }
          }
        }
      } finally {
        if (chunkTimeoutId) clearTimeout(chunkTimeoutId);
      }

      logger.info(
        {
          round,
          model,
          event: "llm-done",
          durationMs: Math.round(performance.now() - llmStart),
          hasToolCalls,
          promptTokens: streamUsage?.prompt_tokens,
          completionTokens: streamUsage?.completion_tokens
        },
        "LLM call finished"
      );

      if (collector) {
        collector.addSpan({
          spanId: createId("span"),
          type: "llm",
          name: `llm-round-${round}`,
          startTime: llmStartIso,
          durationMs: Math.round(performance.now() - llmStart),
          status: "ok",
          llm: {
            model,
            promptTokens: streamUsage?.prompt_tokens ?? 0,
            completionTokens: streamUsage?.completion_tokens ?? 0,
            streaming: true,
            firstTokenMs: firstTokenMsThisRound
          }
        });
      }
      if (streamUsage) {
        cumulativePromptTokens += streamUsage.prompt_tokens ?? 0;
        cumulativeCompletionTokens += streamUsage.completion_tokens ?? 0;
        const actualUsed = streamUsage.prompt_tokens;
        const actualTotal = usage.total;
        yield {
          type: "context_usage",
          context_usage: {
            ...usage,
            used: actualUsed,
            percent: actualTotal > 0 ? Math.round((actualUsed / actualTotal) * 100) : 0,
            source: "actual" as const
          }
        };
      }

      completedRounds++;

      if (!firstTokenSeen && toolCallMap.size === 0) {
        yield* yieldTextAsTokens("（模型未返回内容）");
        break;
      }

      if (hasToolCalls) {
        const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
          [...toolCallMap.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, v]) => ({
              id: v.id,
              type: "function" as const,
              function: { name: v.name, arguments: v.arguments }
            }));

        if (round === MAX_AGENT_ROUNDS - 1) {
          yield* yieldTextAsTokens("（已达到工具调用轮次上限，请缩小问题范围后重试。）");
          break;
        }

        yield {
          type: "thinking",
          summary: buildThinkingSummary(toolCalls)
        };

        messages.push({
          role: "assistant",
          content: streamContent || "",
          tool_calls: toolCalls
        });

        for (const tc of toolCalls) {
          if (tc.type !== "function") continue;
          const fn = tc.function;
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(fn.arguments || "{}") as Record<string, unknown>;
          } catch {
            parsed = {};
          }

          yield {
            type: "tool_call",
            name: fn.name,
            args: parsed
          };

          const def = toolByName.get(fn.name);
          let resultText: string;
          const toolStartIso = new Date().toISOString();
          const toolStart = performance.now();
          if (!def) {
            resultText = `错误：未知工具 ${fn.name}`;
          } else {
            try {
              const strArgs = toStringArgs(parsed);
              resultText = await def.execute(strArgs, projectIds);
            } catch (e) {
              resultText =
                e instanceof Error ? `工具执行失败：${e.message}` : "工具执行失败";
            }
          }
          logger.info(
            {
              round,
              model,
              event: "tool-result",
              tool: fn.name,
              durationMs: Math.round(performance.now() - toolStart),
              resultChars: resultText.length
            },
            "Tool executed"
          );

          const toolStatusPreTruncate =
            resultText.startsWith("错误") || resultText.startsWith("工具执行失败")
              ? ("error" as const)
              : ("ok" as const);
          const toolErrorText = toolStatusPreTruncate === "error" ? resultText : undefined;

          cumulativeToolChars += resultText.length;
          let toolResultTruncated = false;
          if (cumulativeToolChars > MAX_TOOL_RESULT_CHARS) {
            resultText = truncateToTokenLimit(resultText, 2000);
            cumulativeToolChars = MAX_TOOL_RESULT_CHARS;
            toolResultTruncated = true;
          }

          if (collector) {
            collector.addSpan({
              spanId: createId("span"),
              type: "tool",
              name: `tool:${fn.name}`,
              startTime: toolStartIso,
              durationMs: Math.round(performance.now() - toolStart),
              status: toolStatusPreTruncate,
              error: toolErrorText,
              tool: {
                toolName: fn.name,
                args: parsed,
                resultChars: resultText.length,
                resultTruncated: toolResultTruncated
              }
            });
            toolCallCount++;
          }

          yield {
            type: "tool_result",
            name: fn.name,
            content: resultText,
            summary:
              resultText.length > 200 ? `${resultText.slice(0, 200)}…` : resultText
          };

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: resultText
          });
        }

        continue;
      }

      break;
    }

    if (collector) {
      collector.updateTrace({
        agentRounds: completedRounds,
        toolCallCount,
        totalPromptTokens: cumulativePromptTokens,
        totalCompletionTokens: cumulativeCompletionTokens
      });
    }

    logger.info(
      { event: "agent-stream-complete", durationMs: Math.round(performance.now() - totalStart) },
      "Agent stream completed"
    );
    yield { type: "sources", items: sourceItems };
  } catch (e) {
    if (collector) {
      collector.addSpan({
        spanId: createId("span"),
        type: "llm",
        name: "agent-error",
        startTime: new Date().toISOString(),
        durationMs: Math.round(performance.now() - totalStart),
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error"
      });
    }
    logger.error(
      { err: e, event: "agent-stream-error", durationMs: Math.round(performance.now() - totalStart) },
      "Agent stream failed"
    );
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "\n\n（模型响应中断，可能是提供商不稳定，请重试）"
          : e.message
        : "未知错误";
    yield* yieldTextAsTokens(msg);
    yield { type: "sources", items: sourceItems };
  } finally {
    clearTimeout(timer);
  }
}
