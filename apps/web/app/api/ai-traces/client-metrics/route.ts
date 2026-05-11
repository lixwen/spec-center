import { NextResponse } from "next/server";
import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest } from "../../../../lib/session";

export async function POST(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { taskId?: string; ttftMs?: number; streamDurationMs?: number; completed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const taskId = body.taskId?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const collections = await getMongoCollections();
  const trace = await collections.aiTraces.findOne({ taskId });
  if (!trace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (trace.userId !== user._id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const next = { ...trace.clientMetrics };
  if (typeof body.ttftMs === "number") next.ttftMs = body.ttftMs;
  if (typeof body.streamDurationMs === "number") next.streamDurationMs = body.streamDurationMs;
  if (typeof body.completed === "boolean") next.completed = body.completed;

  await collections.aiTraces.updateOne({ taskId }, { $set: { clientMetrics: next } });
  return NextResponse.json({ ok: true });
}
