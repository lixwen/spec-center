import {
  getMongoCollections,
  generateConversationSummary,
  type StructuredHistoryMessage,
  type ConversationMessage
} from "@spec-center/core";
import { getAuthenticatedUserForRequest } from "../../../../../lib/session";

function buildStructuredHistory(messages: ConversationMessage[]): StructuredHistoryMessage[] {
  const result: StructuredHistoryMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
      continue;
    }
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      result.push({
        role: "assistant",
        content: msg.content || "",
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
    } else {
      result.push({ role: "assistant", content: msg.content });
    }
  }
  return result;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const collections = await getMongoCollections();
  const conversation = await collections.conversations.findOne({ _id: id });

  if (!conversation || conversation.user_id !== user._id) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conversation.messages.length < 4) {
    return Response.json({ error: "Conversation too short to compact" }, { status: 400 });
  }

  // Summarize all messages except the most recent 4 (keep 2 turns fresh)
  const keepRecent = 4;
  const toSummarize = buildStructuredHistory(
    conversation.messages.slice(0, conversation.messages.length - keepRecent)
  );

  if (toSummarize.length === 0) {
    return Response.json({ error: "Nothing to compact" }, { status: 400 });
  }

  const summary = await generateConversationSummary(toSummarize, conversation.summary);

  if (!summary) {
    return Response.json({ error: "Summary generation failed" }, { status: 500 });
  }

  const summaryUpTo = conversation.messages.length - keepRecent;
  await collections.conversations.updateOne(
    { _id: id },
    { $set: { summary, summary_up_to: summaryUpTo, updated_at: new Date().toISOString() } }
  );

  return Response.json({
    summary,
    summary_up_to: summaryUpTo,
    total_messages: conversation.messages.length
  });
}
