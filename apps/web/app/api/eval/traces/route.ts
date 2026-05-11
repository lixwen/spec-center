import { NextResponse } from "next/server";
import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../lib/session";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPlatformAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));

  const collections = await getMongoCollections();

  let filter: Record<string, unknown> = {};

  if (q.length > 0) {
    const escaped = escapeRegex(q);
    const taskDocs = await collections.agentTasks
      .find({ query: { $regex: escaped, $options: "i" } })
      .project({ _id: 1 })
      .limit(80)
      .toArray();
    const taskIds = taskDocs.map((t) => t._id);
    const or: Record<string, unknown>[] = [{ traceId: { $regex: escaped, $options: "i" } }];
    if (taskIds.length > 0) {
      or.push({ taskId: { $in: taskIds } });
    }
    filter = { $or: or };
  }

  const traces = await collections.aiTraces.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();

  const taskIdSet = [...new Set(traces.map((t) => t.taskId).filter(Boolean))];
  const tasks =
    taskIdSet.length > 0
      ? await collections.agentTasks
          .find({ _id: { $in: taskIdSet } })
          .project({ _id: 1, query: 1 })
          .toArray()
      : [];
  const taskQueryById = new Map(tasks.map((t) => [t._id, t.query ?? ""] as const));

  const items = traces.map((t) => ({
    traceId: t.traceId,
    query: taskQueryById.get(t.taskId) ?? "",
    model: t.model,
    totalDurationMs: t.totalDurationMs,
    agentRounds: t.agentRounds,
    toolCallCount: t.toolCallCount,
    createdAt: t.createdAt
  }));

  return NextResponse.json({ items });
}
