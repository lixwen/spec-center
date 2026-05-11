import OpenAI from "openai";
import { getMongoCollections } from "../data/mongo";
import {
  ensureCollection,
  upsertPoints,
  deleteByFilter,
  searchPoints,
  type QdrantPoint,
  type QdrantSearchResult
} from "../data/qdrant";
import { splitMarkdownByHeading } from "../utils/chunker";
import { createLogger } from "../utils/logger";
import { nowIso } from "../utils/hash";
import { createId } from "../utils/id";
import type { AITraceCollector } from "./ai-trace-collector";
import type { EmbeddingTask, RagSource, RagChunk } from "../domain/models";

const COLLECTION_NAME = "sc_chunks";

const logger = createLogger("rag-service");

let _aiClient: OpenAI | undefined;

export function getAIClient(): OpenAI {
  if (!_aiClient) {
    const apiKey = process.env.AI_API_KEY ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("AI_API_KEY is not configured. Set AI_API_KEY (and optionally AI_BASE_URL) to use any OpenAI-compatible provider.");
    }
    const baseURL = process.env.AI_BASE_URL ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
    _aiClient = new OpenAI({ baseURL, apiKey });
  }
  return _aiClient;
}

/** @deprecated Use getAIClient() instead */
export const getOpenRouterClient = getAIClient;

function getEmbeddingModel(): string {
  return process.env.AI_EMBEDDING_MODEL ?? process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small";
}

export function getChatModel(): string {
  return process.env.AI_CHAT_MODEL ?? process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-sonnet-4";
}

function getRerankModel(): string {
  return process.env.AI_RERANK_MODEL ?? "cohere/rerank-4-fast";
}

export function isRerankEnabled(): boolean {
  return process.env.AI_RERANK_ENABLED !== "false";
}

export async function rerankDocuments(
  query: string,
  documents: string[],
  topN: number
): Promise<{ index: number; relevanceScore: number }[] | null> {
  if (!isRerankEnabled() || documents.length === 0) return null;
  try {
    const apiKey = process.env.AI_API_KEY ?? process.env.OPENROUTER_API_KEY;
    const baseURL = (process.env.AI_BASE_URL ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");

    const response = await fetch(`${baseURL}/rerank`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: getRerankModel(),
        query,
        documents,
        top_n: topN
      })
    });

    if (!response.ok) {
      logger.warn(
        { event: "rerank-api-error", status: response.status, statusText: response.statusText },
        "Rerank API returned non-OK status, falling back to original order"
      );
      return null;
    }

    const data = await response.json() as {
      results: Array<{ index: number; relevance_score: number; document?: { text: string } }>;
    };

    return data.results.map((r) => ({
      index: r.index,
      relevanceScore: r.relevance_score
    }));
  } catch (err) {
    logger.warn(
      { event: "rerank-failed", err: err instanceof Error ? err.message : String(err) },
      "Rerank call failed, falling back to original order"
    );
    return null;
  }
}

export async function embedText(text: string): Promise<number[]> {
  const client = getAIClient();
  const response = await client.embeddings.create({
    model: getEmbeddingModel(),
    input: text
  });
  return response.data[0].embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const BATCH_SIZE = 5;
  const allEmbeddings: number[][] = [];
  const client = getAIClient();

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: getEmbeddingModel(),
      input: batch
    });
    const sorted = response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
    allEmbeddings.push(...sorted);
  }

  return allEmbeddings;
}

export async function processEmbeddingTask(task: EmbeddingTask): Promise<void> {
  const collections = await getMongoCollections();
  let textContent = "";
  let metadata: Partial<RagChunk> = {
    project_id: task.project_id,
    doc_type: task.doc_type,
    doc_id: task.doc_id
  };

  if (task.doc_type === "snapshot") {
    const snapshot = await collections.snapshots.findOne({ _id: task.doc_id });
    if (!snapshot) return;
    textContent = snapshot.content;

    const spec = await collections.specUnits.findOne({ _id: snapshot.spec_id });
    if (spec) {
      metadata.spec_id = spec._id;
      metadata.capability = spec.capability;
      metadata.change_id = spec.change_id ?? undefined;
    }
  } else if (task.doc_type === "change") {
    const change = await collections.changes.findOne({ _id: task.doc_id });
    if (!change) return;
    textContent = `${change.title}\n\n${change.description}`;
    metadata.change_id = change._id;
  } else if (task.doc_type === "comment") {
    const comment = await collections.comments.findOne({ _id: task.doc_id });
    if (!comment) return;
    textContent = comment.content;
  }

  if (!textContent.trim()) return;

  const markdownChunks = splitMarkdownByHeading(textContent);
  if (markdownChunks.length === 0) return;

  const chunkTexts = markdownChunks.map((c) => c.content);
  const vectors = await embedTexts(chunkTexts);

  const vectorSize = vectors[0].length;
  await ensureCollection(COLLECTION_NAME, vectorSize);

  await deleteByFilter(COLLECTION_NAME, {
    must: [
      { key: "doc_id", match: { value: task.doc_id } }
    ]
  });

  const points: QdrantPoint[] = markdownChunks.map((chunk, i) => ({
    id: crypto.randomUUID(),
    vector: vectors[i],
    payload: {
      project_id: metadata.project_id,
      doc_type: metadata.doc_type,
      doc_id: metadata.doc_id,
      spec_id: metadata.spec_id ?? null,
      change_id: metadata.change_id ?? null,
      capability: metadata.capability ?? null,
      heading_path: chunk.heading_path,
      content: chunk.content,
      chunk_index: chunk.chunk_index
    }
  }));

  await upsertPoints(COLLECTION_NAME, points);
}

export async function deleteVectorsByDocIds(docIds: string[]): Promise<void> {
  if (docIds.length === 0) return;
  try {
    await deleteByFilter(COLLECTION_NAME, {
      should: docIds.map((id) => ({ key: "doc_id", match: { value: id } }))
    });
  } catch {
    // Qdrant collection may not exist yet
  }
}

export async function deleteVectorsByChangeId(changeId: string): Promise<void> {
  try {
    await deleteByFilter(COLLECTION_NAME, {
      must: [{ key: "change_id", match: { value: changeId } }]
    });
  } catch {
    // Qdrant collection may not exist yet
  }
}

export async function enqueueEmbeddingTask(
  docType: EmbeddingTask["doc_type"],
  docId: string,
  projectId: string
): Promise<void> {
  const collections = await getMongoCollections();
  const timestamp = nowIso();
  await collections.embeddingTasks.insertOne({
    _id: createId("embtask"),
    doc_type: docType,
    doc_id: docId,
    project_id: projectId,
    status: "pending",
    retry_count: 0,
    created_at: timestamp,
    updated_at: timestamp
  });
}

const SYSTEM_PROMPT = `你是 Spec Center 的知识助手。基于以下文档上下文回答用户问题。

规则：
- 只基于提供的上下文回答，不要编造信息
- 在回答中用 [来源X] 标注引用，X 对应上下文编号
- 如果上下文中没有相关信息，明确说明"未找到相关文档"
- 使用 Markdown 格式组织回答`;

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

import {
  buildManagedMessages,
  fromSimpleHistory,
  queryNeedsRewriting,
  rewriteQueryWithContext,
  type StructuredHistoryMessage
} from "./context-manager";

function buildPromptMessages(
  query: string,
  chunks: Array<{ content: string; heading_path: string; source_label: string }>,
  history?: ChatHistoryMessage[]
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const structured = fromSimpleHistory(history ?? []);
  const { messages } = buildManagedMessages(SYSTEM_PROMPT, query, chunks, structured);
  return messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: typeof m.content === "string" ? m.content : ""
  }));
}

export async function buildSourcesFromResults(results: QdrantSearchResult[]): Promise<RagSource[]> {
  const seen = new Map<string, RagSource>();

  const projectIds = [...new Set(
    results.map((r) => r.payload.project_id as string).filter(Boolean)
  )];
  const projectNameMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const collections = await getMongoCollections();
    const projects = await collections.projects
      .find({ _id: { $in: projectIds } })
      .project({ _id: 1, name: 1 })
      .toArray();
    for (const p of projects) {
      projectNameMap.set(p._id, (p as any).name ?? p._id);
    }
  }

  for (const result of results) {
    const payload = result.payload;
    const docType = payload.doc_type as string;
    const docId = payload.doc_id as string;
    const projectId = payload.project_id as string;

    if (seen.has(docId)) continue;

    const base = {
      project_id: projectId,
      project_name: projectNameMap.get(projectId) ?? projectId
    };

    if (docType === "snapshot") {
      const specId = payload.spec_id as string | null;
      const capability = payload.capability as string | null;
      seen.set(docId, {
        ...base,
        type: "spec",
        title: capability ?? specId ?? docId,
        href: specId ? `/product-specs/${specId}` : "#"
      });
    } else if (docType === "change") {
      seen.set(docId, {
        ...base,
        type: "change",
        title: docId,
        href: `/changes/${docId}`
      });
    } else if (docType === "comment") {
      seen.set(docId, {
        ...base,
        type: "comment",
        title: `评审评论`,
        href: "#"
      });
    }
  }

  return [...seen.values()];
}

export interface RagStreamEvent {
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
  updatedSummary?: string;
}

export async function* queryRagStream(
  query: string,
  projectIds: string[],
  history?: ChatHistoryMessage[] | StructuredHistoryMessage[],
  conversationSummary?: string,
  collector?: AITraceCollector
): AsyncGenerator<RagStreamEvent> {
  const totalStart = performance.now();

  if (projectIds.length === 0) {
    yield { type: "sources", items: [] };
    return;
  }

  // Context-aware query rewriting: resolve coreferences for better RAG retrieval
  const structuredHist: StructuredHistoryMessage[] = (history ?? []).map((m) =>
    "tool_call_id" in m || "tool_calls" in m || m.role === "tool"
      ? (m as StructuredHistoryMessage)
      : { role: m.role as "user" | "assistant", content: m.content }
  );
  let searchQuery = query;
  if (queryNeedsRewriting(query, structuredHist.length > 0)) {
    const rewriteStart = performance.now();
    searchQuery = await rewriteQueryWithContext(query, structuredHist);
    logger.info(
      {
        event: "query-rewrite",
        durationMs: Math.round(performance.now() - rewriteStart),
        queryBefore: query,
        queryAfter: searchQuery
      },
      "Query rewritten for RAG"
    );
  }

  const embedStart = performance.now();
  const queryVector = await embedText(searchQuery);
  const embeddingDurationMs = Math.round(performance.now() - embedStart);
  logger.info(
    {
      event: "embedding",
      durationMs: embeddingDurationMs,
      vectorDim: queryVector.length
    },
    "Query embedded"
  );

  let searchResults: QdrantSearchResult[] = [];
  let qdrantDurationMs = 0;
  const rerankEnabled = isRerankEnabled();
  const initialLimit = rerankEnabled ? 20 : 5;
  try {
    const qdrantStart = performance.now();
    await ensureCollection(COLLECTION_NAME, queryVector.length);
    const filter = projectIds.length === 1
      ? { must: [{ key: "project_id", match: { value: projectIds[0] } }] }
      : { must: [{ key: "project_id", match: { any: projectIds } }] };
    searchResults = await searchPoints(
      COLLECTION_NAME,
      queryVector,
      filter,
      initialLimit
    );
    qdrantDurationMs = Math.round(performance.now() - qdrantStart);
    logger.info(
      {
        event: "qdrant-search",
        durationMs: qdrantDurationMs,
        hitCount: searchResults.length
      },
      "Qdrant search completed"
    );
  } catch {
    logger.info({ event: "qdrant-search", skipped: true, reason: "unavailable" }, "Qdrant search skipped");
  }

  let rerankDurationMs: number | undefined;
  let preRerankCount: number | undefined;
  let postRerankScores: number[] | undefined;

  if (rerankEnabled && searchResults.length > 0) {
    preRerankCount = searchResults.length;
    const docs = searchResults.map((r) => r.payload.content as string);
    const rerankStart = performance.now();
    const reranked = await rerankDocuments(searchQuery, docs, 5);
    rerankDurationMs = Math.round(performance.now() - rerankStart);

    if (reranked) {
      postRerankScores = reranked.map((r) => r.relevanceScore);
      searchResults = reranked.map((r) => searchResults[r.index]);
      logger.info(
        {
          event: "rerank",
          model: getRerankModel(),
          durationMs: rerankDurationMs,
          preCount: preRerankCount,
          postCount: searchResults.length,
          topScore: postRerankScores[0]
        },
        "Rerank completed"
      );
    } else {
      searchResults = searchResults.slice(0, 5);
      logger.info({ event: "rerank-fallback", preCount: preRerankCount }, "Rerank unavailable, using top-5 from Qdrant");
    }
  }

  const chunks = searchResults.map((r) => ({
    content: r.payload.content as string,
    heading_path: r.payload.heading_path as string,
    source_label:
      (r.payload.capability as string) ??
      (r.payload.doc_id as string)
  }));

  const sourceItems = await buildSourcesFromResults(searchResults);
  logger.info(
    {
      event: "rag-prep-done",
      durationMs: Math.round(performance.now() - totalStart),
      chunkCount: chunks.length
    },
    "RAG prep completed"
  );

  if (collector) {
    collector.addSpan({
      spanId: createId("span"),
      type: "rag_retrieval",
      name: "rag-query",
      startTime: new Date(Date.now() - Math.round(performance.now() - totalStart)).toISOString(),
      durationMs: Math.round(performance.now() - totalStart),
      status: "ok",
      rag: {
        originalQuery: query,
        rewrittenQuery: searchQuery !== query ? searchQuery : undefined,
        resultCount: searchResults.length,
        scores: searchResults.map((r) => r.score),
        embeddingDurationMs,
        searchDurationMs: qdrantDurationMs,
        rerankModel: rerankEnabled ? getRerankModel() : undefined,
        rerankDurationMs,
        preRerankCount,
        postRerankScores
      }
    });
    collector.updateTrace({ ragChunkCount: chunks.length });
  }

  const { queryAgentStream } = await import("./agent-service");
  yield* queryAgentStream(query, projectIds, chunks, history, sourceItems, queryVector, conversationSummary, collector);
}

export async function queryRag(
  query: string,
  projectIds: string[],
  history?: ChatHistoryMessage[] | StructuredHistoryMessage[],
  conversationSummary?: string
): Promise<{ answer: string; sources: RagSource[] }> {
  let answer = "";
  let sources: RagSource[] = [];

  for await (const event of queryRagStream(query, projectIds, history, conversationSummary)) {
    if (event.type === "token" && event.content) {
      answer += event.content;
    } else if (event.type === "sources" && event.items) {
      sources = event.items;
    }
  }

  return { answer, sources };
}
