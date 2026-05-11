import { getMongoCollections } from "../data/mongo";
import type { AITrace, AISpan, AITraceStatus } from "../domain/models";
import { createId } from "../utils/id";

export interface TraceInitMeta {
  conversationId: string;
  taskId: string;
  projectIds: string[];
  userId?: string;
  model: string;
}

export class AITraceCollector {
  readonly traceId: string;
  private meta: TraceInitMeta;
  private spans: AISpan[] = [];
  private traceUpdates: Partial<AITrace> = {};
  private startTime = Date.now();

  constructor(meta: TraceInitMeta) {
    this.traceId = createId("trace");
    this.meta = meta;
  }

  addSpan(span: Omit<AISpan, "_id" | "traceId" | "createdAt">): void {
    this.spans.push({
      ...span,
      _id: createId("aispan"),
      traceId: this.traceId,
      createdAt: new Date().toISOString()
    });
  }

  updateTrace(
    updates: Partial<
      Pick<
        AITrace,
        | "agentRounds"
        | "toolCallCount"
        | "ragChunkCount"
        | "totalPromptTokens"
        | "totalCompletionTokens"
        | "estimatedCostUsd"
        | "contextCompaction"
        | "error"
      >
    >
  ): void {
    Object.assign(this.traceUpdates, updates);
  }

  async flush(status: AITraceStatus): Promise<void> {
    try {
      const collections = await getMongoCollections();
      const now = new Date().toISOString();
      const existing = await collections.aiTraces.findOne({ traceId: this.traceId });
      const mergedClient =
        existing?.clientMetrics || this.traceUpdates.clientMetrics
          ? {
              ...existing?.clientMetrics,
              ...this.traceUpdates.clientMetrics
            }
          : undefined;
      const trace: AITrace = {
        _id: createId("aitrace"),
        traceId: this.traceId,
        conversationId: this.meta.conversationId,
        taskId: this.meta.taskId,
        projectIds: this.meta.projectIds,
        userId: this.meta.userId,
        model: this.meta.model,
        totalDurationMs: Date.now() - this.startTime,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        agentRounds: 0,
        toolCallCount: 0,
        ragChunkCount: 0,
        status,
        createdAt: new Date(this.startTime).toISOString(),
        completedAt: now,
        ...this.traceUpdates,
        ...(mergedClient ? { clientMetrics: mergedClient } : {})
      };

      const results = await Promise.allSettled([
        collections.aiTraces.updateOne({ traceId: this.traceId }, { $set: trace }, { upsert: true }),
        this.spans.length > 0 ? collections.aiSpans.insertMany(this.spans) : Promise.resolve()
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          console.warn("[ai-trace] flush partial failure:", result.reason);
        }
      }

      this.spans = [];
    } catch (err) {
      console.warn("[ai-trace] flush failed:", err);
    }
  }
}
