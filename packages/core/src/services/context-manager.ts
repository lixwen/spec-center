import type OpenAI from "openai";
import { createLogger } from "../utils/logger";

const logger = createLogger("context-manager");

/**
 * Enhanced history message that preserves the full LLM conversation structure
 * including tool calls and tool results, enabling faithful multi-turn replay.
 */
export interface StructuredHistoryMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  tool_call_id?: string;
  estimated_tokens?: number;
}

export interface ContextBudget {
  /** Total model context window in tokens */
  contextWindow: number;
  /** Tokens reserved for model output */
  reservedOutput: number;
  /** Tokens used by system prompt */
  systemPromptTokens: number;
  /** Tokens used by current query + RAG chunks */
  currentTurnTokens: number;
  /** Tokens used by conversation history (after compaction) */
  historyTokens: number;
  /** Remaining budget for history messages */
  historyBudget: number;
}

/** Serializable usage snapshot sent to the frontend */
export interface ContextUsageSnapshot {
  used: number;
  total: number;
  percent: number;
  breakdown: {
    system: number;
    history: number;
    currentTurn: number;
    reservedOutput: number;
  };
  /** "estimate" = heuristic pre-call; "actual" = from API usage response */
  source: "estimate" | "actual";
  modelName?: string;
  compactionLevel: number;
  droppedTurns: number;
}

export interface ContextManagerConfig {
  /** Model context window size in tokens. Defaults to env or 128000. */
  contextWindowTokens?: number;
  /** Tokens reserved for model output. Defaults to 8000. */
  reservedOutputTokens?: number;
  /** Maximum number of recent turns to keep full tool details for. Defaults to 3. */
  recentTurnsWithTools?: number;
  /** Whether to apply prompt cache markers (for providers that support it, e.g. Anthropic). Defaults to env or false. */
  enableCacheMarkers?: boolean;
  /** Fraction of context window reserved as compaction buffer (0-1). Defaults to 0.15. */
  compactionBufferPercent?: number;
  /** Usage fraction (0-1) at which proactive L1 compaction triggers. Defaults to 0.80. */
  proactiveCompactionThreshold?: number;
}

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_RESERVED_OUTPUT = 8_000;
const DEFAULT_RECENT_TURNS_WITH_TOOLS = 3;
const DEFAULT_COMPACTION_BUFFER_PERCENT = 0.15;
const DEFAULT_PROACTIVE_COMPACTION_THRESHOLD = 0.80;

// ---------------------------------------------------------------------------
// Dynamic model info from AI provider API
// ---------------------------------------------------------------------------

export interface ModelContextInfo {
  contextLength: number;
  maxCompletionTokens: number | null;
  name: string;
  fetchedAt: number;
}

let _modelInfoCache = new Map<string, ModelContextInfo>();
const MODEL_INFO_TTL_MS = 30 * 60 * 1000; // 30 min

export async function fetchModelContextInfo(modelId: string): Promise<ModelContextInfo | null> {
  const cached = _modelInfoCache.get(modelId);
  if (cached && Date.now() - cached.fetchedAt < MODEL_INFO_TTL_MS) {
    return cached;
  }

  const apiKey = process.env.AI_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const baseURL = process.env.AI_BASE_URL ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;

    const { data } = await res.json() as { data: Array<{
      id: string; name: string; context_length: number | null;
      top_provider: { context_length: number | null; max_completion_tokens: number | null };
    }> };

    for (const m of data) {
      const info: ModelContextInfo = {
        contextLength: m.top_provider?.context_length ?? m.context_length ?? DEFAULT_CONTEXT_WINDOW,
        maxCompletionTokens: m.top_provider?.max_completion_tokens ?? null,
        name: m.name,
        fetchedAt: Date.now()
      };
      _modelInfoCache.set(m.id, info);
    }

    logger.info({ event: "model-info-fetch", modelCount: data.length }, "Fetched model info");
    return _modelInfoCache.get(modelId) ?? null;
  } catch (err) {
    logger.warn({ err, event: "model-info-fetch-failed" }, "Failed to fetch model info");
    return null;
  }
}

/**
 * Get model context window and output limits. Tries dynamic fetch first,
 * falls back to env var, then hard default.
 */
export async function getModelLimits(modelId?: string): Promise<{ contextWindow: number; maxOutput: number }> {
  if (modelId) {
    const info = await fetchModelContextInfo(modelId);
    if (info) {
      return {
        contextWindow: info.contextLength,
        maxOutput: info.maxCompletionTokens ?? DEFAULT_RESERVED_OUTPUT
      };
    }
  }
  return {
    contextWindow: getConfiguredContextWindow(),
    maxOutput: DEFAULT_RESERVED_OUTPUT
  };
}

function getConfiguredContextWindow(): number {
  const env = process.env.CONTEXT_WINDOW_TOKENS;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Fast token estimation. Uses a heuristic: ASCII chars ~0.25 tokens,
 * CJK/unicode ~0.5 tokens. Intentionally overestimates to stay safe.
 */
export function estimateTokens(text: string): number {
  let estimated = 0;
  for (const ch of text) {
    estimated += ch.codePointAt(0)! <= 127 ? 0.25 : 0.5;
  }
  return Math.ceil(estimated);
}

export function estimateMessageTokens(msg: StructuredHistoryMessage): number {
  if (msg.estimated_tokens !== undefined) return msg.estimated_tokens;

  let tokens = estimateTokens(msg.content || "");
  tokens += 4; // role + framing overhead per message

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      tokens += estimateTokens(tc.name) + estimateTokens(tc.arguments) + 8;
    }
  }

  return tokens;
}

/**
 * Calculate the token budget available for conversation history.
 * Applies compaction buffer to reserve headroom and prevent hitting hard limits.
 */
export function calculateBudget(
  systemPrompt: string,
  currentTurnContent: string,
  config?: ContextManagerConfig
): ContextBudget {
  const contextWindow = config?.contextWindowTokens ?? getConfiguredContextWindow();
  const bufferPercent = config?.compactionBufferPercent ?? DEFAULT_COMPACTION_BUFFER_PERCENT;
  const effectiveWindow = Math.floor(contextWindow * (1 - bufferPercent));
  const reservedOutput = config?.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT;
  const systemPromptTokens = estimateTokens(systemPrompt) + 4;
  const currentTurnTokens = estimateTokens(currentTurnContent) + 4;
  const historyBudget = effectiveWindow - reservedOutput - systemPromptTokens - currentTurnTokens;

  return {
    contextWindow,
    reservedOutput,
    systemPromptTokens,
    currentTurnTokens,
    historyTokens: 0,
    historyBudget: Math.max(0, historyBudget)
  };
}

/**
 * Identify "turn boundaries" in a structured history.
 * A turn is a user message followed by all assistant/tool messages before the next user message.
 */
function identifyTurns(history: StructuredHistoryMessage[]): StructuredHistoryMessage[][] {
  const turns: StructuredHistoryMessage[][] = [];
  let current: StructuredHistoryMessage[] = [];

  for (const msg of history) {
    if (msg.role === "user" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(msg);
  }
  if (current.length > 0) {
    turns.push(current);
  }
  return turns;
}

/**
 * Compact tool results in older turns to reduce token usage.
 * Recent turns keep full tool results; older turns get summaries.
 */
function compactOlderToolResults(
  turns: StructuredHistoryMessage[][],
  recentTurnsToKeep: number
): StructuredHistoryMessage[][] {
  if (turns.length <= recentTurnsToKeep) return turns;

  const cutoff = turns.length - recentTurnsToKeep;
  return turns.map((turn, turnIdx) => {
    if (turnIdx >= cutoff) return turn;

    return turn.map((msg) => {
      if (msg.role !== "tool") return msg;
      const contentLen = (msg.content || "").length;
      if (contentLen <= 200) return msg;

      const toolName = msg.tool_call_id ? `tool_call_id=${msg.tool_call_id}` : "tool";
      return {
        ...msg,
        content: `[${toolName} 返回了约 ${contentLen} 字符的结果，已折叠]`,
        estimated_tokens: undefined
      };
    });
  });
}

export interface TrimResult {
  messages: StructuredHistoryMessage[];
  compactionLevel: number;
  droppedTurns: number;
  /** Messages that were dropped during L2 compaction (available for summarization) */
  droppedMessages: StructuredHistoryMessage[];
}

/**
 * Token-aware history trimming with progressive compaction.
 *
 * Strategy (inspired by Claude Code auto-compact):
 * 1. Try full history as-is (or proactive L1 if over threshold)
 * 2. If over budget → compact tool results in older turns (Level 1)
 * 3. If still over budget → drop oldest turns one by one (Level 2)
 * 4. If still over budget → keep only the most recent turn (Level 3)
 *
 * Dropped messages are preserved in the result for upstream summary generation.
 */
export function trimHistoryToFitBudget(
  history: StructuredHistoryMessage[],
  tokenBudget: number,
  config?: ContextManagerConfig
): TrimResult {
  if (history.length === 0 || tokenBudget <= 0) {
    return { messages: [], compactionLevel: 0, droppedTurns: 0, droppedMessages: [] };
  }

  const totalTokens = history.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  const proactiveThreshold = config?.proactiveCompactionThreshold ?? DEFAULT_PROACTIVE_COMPACTION_THRESHOLD;

  // Proactive L1: if usage exceeds threshold, compact tool results even if under hard budget
  const usageRatio = totalTokens / tokenBudget;
  if (totalTokens <= tokenBudget && usageRatio <= proactiveThreshold) {
    return { messages: history, compactionLevel: 0, droppedTurns: 0, droppedMessages: [] };
  }

  // Level 1: compact tool results in older turns
  const recentTurns = config?.recentTurnsWithTools ?? DEFAULT_RECENT_TURNS_WITH_TOOLS;
  const turns = identifyTurns(history);
  const compactedTurns = compactOlderToolResults(turns, recentTurns);
  const compactedMessages = compactedTurns.flat();
  const compactedTokens = compactedMessages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);

  if (compactedTokens <= tokenBudget) {
    const level = totalTokens <= tokenBudget ? 1 : 1; // proactive or reactive L1
    logger.info(
      {
        event: "L1-compact",
        tokensBefore: totalTokens,
        tokensAfter: compactedTokens,
        tokenBudget
      },
      "L1 compaction applied"
    );
    return { messages: compactedMessages, compactionLevel: level, droppedTurns: 0, droppedMessages: [] };
  }

  // Level 2: drop oldest turns until within budget, collecting dropped messages
  let droppedTurns = 0;
  const remaining = [...compactedTurns];
  const droppedMessages: StructuredHistoryMessage[] = [];
  let remainingTokens = compactedTokens;

  while (remaining.length > 1 && remainingTokens > tokenBudget) {
    const dropped = remaining.shift()!;
    const droppedTokens = dropped.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
    remainingTokens -= droppedTokens;
    droppedMessages.push(...dropped);
    droppedTurns++;
  }

  const level2Messages = remaining.flat();
  logger.info(
    {
      event: "L2-drop",
      tokensBefore: totalTokens,
      tokensAfter: remainingTokens,
      droppedTurns,
      tokenBudget
    },
    "L2 dropped oldest turns"
  );

  return { messages: level2Messages, compactionLevel: 2, droppedTurns, droppedMessages };
}

/**
 * Convert StructuredHistoryMessages into OpenAI ChatCompletionMessageParam format
 * for injection into the LLM messages array.
 */
export function toOpenAIMessages(
  history: StructuredHistoryMessage[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return history.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: msg.tool_call_id!,
        content: msg.content
      };
    }
    if (msg.role === "assistant") {
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
      const base: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: "assistant" as const,
        content: msg.content || (hasToolCalls ? "" : "")
      };
      if (hasToolCalls) {
        base.tool_calls = msg.tool_calls!.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments }
        }));
      }
      return base;
    }
    return {
      role: "user" as const,
      content: msg.content
    };
  });
}

/**
 * Build the full LLM message array with token-aware context management.
 * Replaces the old buildAgentMessages + trimHistory pattern.
 */
export function buildManagedMessages(
  systemPrompt: string,
  query: string,
  ragChunks: Array<{ content: string; heading_path: string; source_label: string }>,
  history: StructuredHistoryMessage[],
  conversationSummary?: string,
  config?: ContextManagerConfig
): {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  budget: ContextBudget;
  usage: ContextUsageSnapshot;
  compactionLevel: number;
  droppedTurns: number;
  droppedMessages: StructuredHistoryMessage[];
} {
  let userContent: string;
  if (ragChunks.length === 0) {
    userContent = `${query}\n\n（注意：向量检索未返回文档片段）`;
  } else {
    const contextBlock = ragChunks
      .map(
        (c, i) =>
          `[来源${i + 1}] ${c.source_label}${c.heading_path ? ` > ${c.heading_path}` : ""}\n${c.content}`
      )
      .join("\n\n---\n\n");
    userContent = `文档上下文：\n\n${contextBlock}\n\n---\n\n问题：${query}`;
  }

  const budget = calculateBudget(systemPrompt, userContent, config);

  // If we have a conversation summary from a previous compaction, inject it as a
  // pseudo system-level context preamble to preserve key information from dropped turns.
  let effectiveHistory = history;
  let summaryPrefix: StructuredHistoryMessage[] = [];
  if (conversationSummary && history.length > 0) {
    summaryPrefix = [{
      role: "user" as const,
      content: `[对话摘要 — 以下是之前对话的关键信息]\n${conversationSummary}`
    }, {
      role: "assistant" as const,
      content: "好的，我已了解之前的对话上下文，请继续提问。"
    }];
  }

  const summaryTokens = summaryPrefix.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  const historyBudget = budget.historyBudget - summaryTokens;

  const { messages: trimmedHistory, compactionLevel, droppedTurns, droppedMessages } =
    trimHistoryToFitBudget(effectiveHistory, historyBudget, config);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt }
  ];

  if (summaryPrefix.length > 0 && (droppedTurns > 0 || compactionLevel > 0)) {
    messages.push(...toOpenAIMessages(summaryPrefix));
  }

  messages.push(...toOpenAIMessages(trimmedHistory));
  messages.push({ role: "user", content: userContent });

  const historyTokens = trimmedHistory.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
    + summaryTokens;
  const updatedBudget = { ...budget, historyTokens };

  const used = updatedBudget.systemPromptTokens + historyTokens + updatedBudget.currentTurnTokens;
  const total = updatedBudget.contextWindow;
  const usage: ContextUsageSnapshot = {
    used,
    total,
    percent: total > 0 ? Math.round((used / total) * 100) : 0,
    breakdown: {
      system: updatedBudget.systemPromptTokens,
      history: historyTokens,
      currentTurn: updatedBudget.currentTurnTokens,
      reservedOutput: updatedBudget.reservedOutput
    },
    source: "estimate",
    compactionLevel,
    droppedTurns
  };

  const enableCache = config?.enableCacheMarkers
    ?? (process.env.ENABLE_PROMPT_CACHE === "true");
  const finalMessages = enableCache ? applyCacheMarkers(messages) : messages;

  return { messages: finalMessages, budget: updatedBudget, usage, compactionLevel, droppedTurns, droppedMessages };
}

/**
 * Async compaction: if L2 would drop turns, first summarize the dropped content
 * via LLM, then rebuild the message array with the summary injected.
 *
 * Two-pass approach:
 * 1. Dry-run buildManagedMessages to detect what would be dropped
 * 2. If turns are dropped, generate summary of dropped turns, merge with existing summary
 * 3. Rebuild with the updated summary so the information is preserved
 */
export async function compactWithSummary(
  systemPrompt: string,
  query: string,
  ragChunks: Array<{ content: string; heading_path: string; source_label: string }>,
  history: StructuredHistoryMessage[],
  existingSummary?: string,
  config?: ContextManagerConfig
): Promise<{
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  budget: ContextBudget;
  usage: ContextUsageSnapshot;
  compactionLevel: number;
  droppedTurns: number;
  updatedSummary?: string;
}> {
  // Pass 1: detect what would be dropped
  const firstPass = buildManagedMessages(systemPrompt, query, ragChunks, history, existingSummary, config);

  if (firstPass.droppedMessages.length === 0) {
    return { ...firstPass, updatedSummary: existingSummary };
  }

  // Turns are being dropped — summarize them before discarding
  logger.info(
    {
      event: "compact-with-summary",
      droppedTurns: firstPass.droppedTurns,
      droppedMessageCount: firstPass.droppedMessages.length
    },
    "Summarizing dropped turns before compaction"
  );

  const updatedSummary = await generateConversationSummary(
    firstPass.droppedMessages,
    existingSummary
  );

  // Pass 2: rebuild with the updated summary (dropped info now lives in summary)
  const secondPass = buildManagedMessages(systemPrompt, query, ragChunks, history, updatedSummary, config);

  return { ...secondPass, updatedSummary };
}

/**
 * Apply prompt cache markers to the messages array.
 * Some providers (e.g. Anthropic) support cache_control on messages to avoid re-processing
 * unchanged prefixes in multi-turn conversations.
 *
 * Strategy: mark the system prompt and the last stable history message as cache breakpoints.
 * This means subsequent turns only need to process the new messages.
 */
export function applyCacheMarkers(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  if (messages.length === 0) return messages;

  const result = messages.map((m) => ({ ...m }));

  // Mark system prompt for caching (always stable across turns)
  if (result[0]?.role === "system") {
    (result[0] as Record<string, unknown>).cache_control = { type: "ephemeral" };
  }

  // Find the last history message before the current user query.
  // This is the "stable prefix boundary" — everything before it doesn't change between turns.
  let lastHistoryIdx = -1;
  for (let i = result.length - 2; i >= 1; i--) {
    if (result[i].role === "assistant" || result[i].role === "user") {
      lastHistoryIdx = i;
      break;
    }
  }

  if (lastHistoryIdx > 0) {
    (result[lastHistoryIdx] as Record<string, unknown>).cache_control = { type: "ephemeral" };
  }

  return result;
}

/**
 * Backward-compatible: convert simple {role, content} history to StructuredHistoryMessage[].
 */
export function fromSimpleHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): StructuredHistoryMessage[] {
  return history.map((m) => ({
    role: m.role,
    content: m.content
  }));
}

// ---------------------------------------------------------------------------
// Context-aware RAG query rewriting
// ---------------------------------------------------------------------------

const QUERY_REWRITE_PROMPT = `你是一个查询改写助手。用户在多轮对话中可能使用代词或省略主语。
请结合对话上下文，将用户的最新查询改写为一个完整、自含的查询语句，用于向量检索。

规则：
- 如果查询已经是自含的（不依赖上下文就能理解），原样返回
- 将代词（那个、它、这个 Spec 等）替换为具体的 ID 或名称
- 保持改写后的查询简洁（不超过原查询长度的 2 倍）
- 只返回改写后的查询，不要解释`;

/**
 * Detect if a query likely contains coreferences that need resolution.
 * Uses simple heuristics to avoid unnecessary LLM calls.
 */
export function queryNeedsRewriting(query: string, hasHistory: boolean): boolean {
  if (!hasHistory) return false;
  const coreferencePatterns = /那个|这个|它的|上面的|刚才|前面|那边|同样的|该\s|其中|另外那|上述/;
  return coreferencePatterns.test(query);
}

/**
 * Rewrite a query to resolve coreferences using conversation context.
 * Only called when queryNeedsRewriting() returns true.
 */
export async function rewriteQueryWithContext(
  query: string,
  recentHistory: StructuredHistoryMessage[]
): Promise<string> {
  const { getAIClient, getChatModel } = await import("./rag-service");

  const contextSnippet = recentHistory
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${(m.content || "").slice(0, 300)}`)
    .join("\n");

  const client = getAIClient();
  const model = process.env.AI_SUMMARY_MODEL ?? process.env.OPENROUTER_SUMMARY_MODEL ?? getChatModel();

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: QUERY_REWRITE_PROMPT },
        {
          role: "user",
          content: `对话上下文：\n${contextSnippet}\n\n用户最新查询：${query}`
        }
      ],
      max_tokens: 200
    });

    const rewritten = response.choices[0]?.message?.content?.trim();
    if (rewritten && rewritten.length > 0 && rewritten.length < query.length * 3) {
      logger.info(
        { event: "query-rewrite", queryBefore: query, queryAfter: rewritten },
        "Query rewritten with context"
      );
      return rewritten;
    }
    return query;
  } catch (err) {
    logger.error({ err, event: "query-rewrite-failed" }, "Query rewrite failed");
    return query;
  }
}

// ---------------------------------------------------------------------------
// Auto-summary generation
// ---------------------------------------------------------------------------

const SUMMARY_SYSTEM_PROMPT = `你是一个对话摘要助手。请将以下多轮对话压缩为一份结构化摘要。

摘要应包含：
1. 讨论了哪些 Change / Spec（列出 ID 和名称）
2. 用户的核心问题和关注点
3. 已得出的结论或分析结果
4. 未解决的问题或待确认事项

格式要求：
- 使用中文
- 使用 Markdown 列表
- 尽量精简，控制在 500 字以内
- 不要遗漏关键的 ID、名称、数值等信息`;

/**
 * Generate a structured summary of conversation turns using the LLM.
 * This is called when context compaction drops turns and we need to
 * preserve their key information as a summary.
 */
export async function generateConversationSummary(
  turns: StructuredHistoryMessage[],
  existingSummary?: string
): Promise<string> {
  const { getAIClient, getChatModel } = await import("./rag-service");

  const conversationText = turns
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${(m.content || "").slice(0, 2000)}`)
    .join("\n\n");

  const userContent = existingSummary
    ? `以下是之前的摘要：\n${existingSummary}\n\n---\n\n请将以下新的对话内容合并到摘要中：\n\n${conversationText}`
    : `请为以下对话生成摘要：\n\n${conversationText}`;

  const client = getAIClient();
  const summaryModel = process.env.AI_SUMMARY_MODEL ?? process.env.OPENROUTER_SUMMARY_MODEL ?? getChatModel();

  try {
    const response = await client.chat.completions.create({
      model: summaryModel,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ],
      max_tokens: 1000
    });

    const summary = response.choices[0]?.message?.content?.trim();
    if (!summary) {
      logger.info({ event: "summary-gen", emptyResponse: true }, "Summary generation returned empty");
      return existingSummary ?? "";
    }

    logger.info({ event: "summary-gen", summaryChars: summary.length }, "Summary generated");
    return summary;
  } catch (err) {
    logger.error({ err, event: "summary-gen-failed" }, "Summary generation failed");
    return existingSummary ?? "";
  }
}

/**
 * Determine if a conversation needs summary generation based on message count
 * and whether existing summary covers recent enough messages.
 */
export function needsSummaryUpdate(
  totalMessages: number,
  summaryUpTo: number | undefined,
  threshold: number = 10
): boolean {
  const uncoveredMessages = totalMessages - (summaryUpTo ?? 0);
  return uncoveredMessages >= threshold;
}
