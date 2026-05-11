import { getMongoCollections } from "../data/mongo";
import { nowIso } from "../utils/hash";
import type {
  ConversationMessage,
  ConversationAgentStep,
  ConversationToolCall,
  ConversationToolResult,
  RagSource,
  AgentTaskEvent
} from "../domain/models";
import type { StructuredHistoryMessage } from "./context-manager";
import { needsSummaryUpdate, generateConversationSummary } from "./context-manager";
import { createLogger } from "../utils/logger";
import { AITraceCollector } from "./ai-trace-collector";
import { getChatModel } from "./rag-service";

const logger = createLogger("agent-task-runner");

export function buildStructuredHistory(messages: ConversationMessage[]): StructuredHistoryMessage[] {
  const result: StructuredHistoryMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
      continue;
    }
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      result.push({
        role: "assistant",
        content: "",
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments
        }))
      });
      if (msg.tool_results) {
        for (const tr of msg.tool_results) {
          result.push({
            role: "tool",
            content: tr.content,
            tool_call_id: tr.tool_call_id
          });
        }
      }
      if (msg.content) {
        result.push({ role: "assistant", content: msg.content });
      }
    } else {
      result.push({ role: "assistant", content: msg.content || "" });
    }
  }
  return result;
}

async function pushEvent(
  taskId: string,
  seq: number,
  type: AgentTaskEvent["type"],
  data: Record<string, unknown>,
  extraSet?: Record<string, unknown>
): Promise<void> {
  const collections = await getMongoCollections();
  const event: AgentTaskEvent = { seq, type, data, created_at: nowIso() };
  await collections.agentTasks.updateOne(
    { _id: taskId },
    {
      $push: { events: event },
      $set: { updated_at: nowIso(), ...extraSet }
    }
  );
}

/**
 * Execute an agent task asynchronously. Consumes the queryRagStream generator
 * and writes each event to MongoDB in real time so SSE clients can poll for updates.
 * On completion, persists the assistant message to the conversation.
 */
export async function startAgentTask(taskId: string): Promise<void> {
  const collections = await getMongoCollections();
  const task = await collections.agentTasks.findOne({ _id: taskId });
  if (!task) {
    logger.error({ taskId, event: "task-not-found" }, "Agent task not found");
    return;
  }

  const { conversation_id: conversationId, project_ids: projectIds, query } = task;

  const conversation = await collections.conversations.findOne({ _id: conversationId });
  if (!conversation) {
    await collections.agentTasks.updateOne(
      { _id: taskId },
      { $set: { status: "error", error: "Conversation not found", updated_at: nowIso() } }
    );
    return;
  }

  const history = buildStructuredHistory(conversation.messages);
  const conversationSummary = conversation.summary;

  let collector: AITraceCollector | undefined;
  let seq = 0;
  let fullAnswer = "";
  let finalSources: RagSource[] = [];
  let latestSummary = conversationSummary;
  const agentSteps: ConversationAgentStep[] = [];
  const toolCalls: ConversationToolCall[] = [];
  const toolResults: ConversationToolResult[] = [];

  try {
    const { queryRagStream } = await import("./rag-service");

    collector = new AITraceCollector({
      conversationId,
      taskId,
      projectIds,
      userId: task.user_id,
      model: getChatModel()
    });

    for await (const event of queryRagStream(query, projectIds, history, conversationSummary, collector)) {
      seq++;

      if (event.type === "token" && event.content) {
        fullAnswer += event.content;
        await pushEvent(taskId, seq, "token", { content: event.content }, { full_answer: fullAnswer });
      } else if (event.type === "sources" && event.items) {
        finalSources = event.items;
        await pushEvent(taskId, seq, "sources", { items: event.items });
      } else if (event.type === "summary_updated" && event.updatedSummary) {
        latestSummary = event.updatedSummary;
        void collections.conversations.updateOne(
          { _id: conversationId },
          { $set: { summary: event.updatedSummary, summary_up_to: history.length } }
        );
        await pushEvent(taskId, seq, "summary_updated", { updatedSummary: event.updatedSummary });
      } else if (event.type === "context_usage" && event.context_usage) {
        await pushEvent(taskId, seq, "context_usage", { context_usage: event.context_usage });
      } else if (event.type === "tool_call" || event.type === "tool_result" || event.type === "thinking") {
        agentSteps.push({
          type: event.type,
          name: event.name,
          args: event.args,
          summary: event.summary,
          content: event.content
        });
        if (event.type === "tool_call" && event.name) {
          toolCalls.push({
            id: `tc_${toolCalls.length}`,
            name: event.name,
            arguments: event.args ? JSON.stringify(event.args) : "{}"
          });
        }
        if (event.type === "tool_result" && event.name) {
          const matchingTcId = toolCalls.length > 0
            ? toolCalls[toolCalls.length - 1].id
            : `tc_${toolResults.length}`;
          toolResults.push({
            tool_call_id: matchingTcId,
            content: event.content ?? event.summary ?? ""
          });
        }
        await pushEvent(taskId, seq, event.type, {
          name: event.name,
          args: event.args,
          summary: event.summary,
          content: event.content
        });
      }
    }

    // Persist assistant message to conversation
    const assistantTimestamp = nowIso();
    await collections.conversations.updateOne(
      { _id: conversationId },
      {
        $push: {
          messages: {
            role: "assistant",
            content: fullAnswer,
            sources: finalSources.length > 0 ? finalSources : undefined,
            agent_steps: agentSteps.length > 0 ? agentSteps : undefined,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            tool_results: toolResults.length > 0 ? toolResults : undefined,
            created_at: assistantTimestamp
          } as ConversationMessage
        },
        $set: { updated_at: assistantTimestamp }
      }
    );

    // Mark task done
    seq++;
    await pushEvent(taskId, seq, "done", {});
    await collections.agentTasks.updateOne(
      { _id: taskId },
      { $set: { status: "done", full_answer: fullAnswer, updated_at: nowIso() } }
    );

    logger.info({ taskId, event: "task-done", answerChars: fullAnswer.length }, "Agent task completed");
    if (collector) await collector.flush("completed");

    // Background summary generation
    const totalMsgCount = history.length + 2;
    if (needsSummaryUpdate(totalMsgCount, undefined) && latestSummary === conversationSummary) {
      void (async () => {
        try {
          const conv = await collections.conversations.findOne({ _id: conversationId });
          if (!conv) return;
          const summaryUpTo = conv.summary_up_to ?? 0;
          if (!needsSummaryUpdate(conv.messages.length, summaryUpTo)) return;
          const turnsToSummarize = buildStructuredHistory(
            conv.messages.slice(summaryUpTo, conv.messages.length - 4)
          );
          if (turnsToSummarize.length === 0) return;
          const summary = await generateConversationSummary(turnsToSummarize, latestSummary);
          if (summary) {
            await collections.conversations.updateOne(
              { _id: conversationId },
              { $set: { summary, summary_up_to: conv.messages.length - 4 } }
            );
            logger.info({ conversationId, event: "background-summary-updated" }, "Conversation summary updated");
          }
        } catch (err) {
          logger.error({ err, conversationId, event: "background-summary-failed" }, "Background summary failed");
        }
      })();
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, taskId, event: "task-error" }, "Agent task failed");

    try {
      if (fullAnswer || toolCalls.length > 0) {
        const assistantTimestamp = nowIso();
        await collections.conversations.updateOne(
          { _id: conversationId },
          {
            $push: {
              messages: {
                role: "assistant",
                content: fullAnswer || "",
                agent_steps: agentSteps.length > 0 ? agentSteps : undefined,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                tool_results: toolResults.length > 0 ? toolResults : undefined,
                created_at: assistantTimestamp
              } as ConversationMessage
            },
            $set: { updated_at: assistantTimestamp }
          }
        );
      }

      await collector?.flush("error");
      seq++;
      await pushEvent(taskId, seq, "error", { content: errorMsg });
      await collections.agentTasks.updateOne(
        { _id: taskId },
        { $set: { status: "error", error: errorMsg, full_answer: fullAnswer, updated_at: nowIso() } }
      );
    } catch (dbErr) {
      logger.error({ err: dbErr, taskId, event: "persist-error-state-failed" }, "Failed to persist agent task error state");
    }
  }
}
