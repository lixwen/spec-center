import {
  getMongoCollections,
  createId,
  nowIso,
  startAgentTask,
  createLogger,
  type ConversationMessage,
  type StructuredHistoryMessage
} from "@spec-center/core";
import { getAuthenticatedUserForRequest } from "../../../lib/session";
import { getActiveProjectId } from "../../../lib/project";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const logger = createLogger("ask-route").child(requestId ? { requestId } : {});

  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!process.env.AI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "AI_API_KEY is not configured" }, { status: 503 });
  }

  let body: { query?: string; projectId?: string; conversationId?: string; crossProject?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return Response.json({ error: "Query is required" }, { status: 400 });
  }

  const collections = await getMongoCollections();
  let projectIds: string[];

  if (body.crossProject) {
    const isPlatformAdmin = user.global_roles?.includes("platform_admin");
    if (isPlatformAdmin) {
      const allProjects = await collections.projects
        .find({ $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }] })
        .project({ _id: 1 })
        .toArray();
      projectIds = allProjects.map((p) => p._id);
    } else {
      projectIds = (user.memberships ?? []).map((m) => m.project_id);
    }
    if (projectIds.length === 0) {
      return Response.json({ error: "No accessible projects" }, { status: 400 });
    }
  } else {
    const projectId = body.projectId ?? (await getActiveProjectId(user)) ?? undefined;
    if (!projectId) {
      return Response.json({ error: "No active project" }, { status: 400 });
    }
    projectIds = [projectId];
  }

  const activeProjectId = projectIds[0];

  let conversationId = body.conversationId;

  if (conversationId) {
    const existing = await collections.conversations.findOne({ _id: conversationId });
    if (!existing || existing.user_id !== user._id) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
  } else {
    const timestamp = nowIso();
    conversationId = createId("conv");
    await collections.conversations.insertOne({
      _id: conversationId,
      project_id: activeProjectId,
      user_id: user._id,
      title: query.slice(0, 50),
      messages: [],
      created_at: timestamp,
      updated_at: timestamp
    });
  }

  // Push user message
  const userTimestamp = nowIso();
  await collections.conversations.updateOne(
    { _id: conversationId },
    {
      $push: {
        messages: { role: "user", content: query, created_at: userTimestamp } as ConversationMessage
      },
      $set: { updated_at: userTimestamp }
    }
  );

  // Create agent task
  const taskId = createId("atask");
  await collections.agentTasks.insertOne({
    _id: taskId,
    conversation_id: conversationId,
    user_id: user._id,
    project_ids: projectIds,
    query,
    status: "running",
    events: [],
    full_answer: "",
    created_at: nowIso(),
    updated_at: nowIso()
  });

  startAgentTask(taskId).catch((err) => {
    logger.error({ err, taskId, event: "background-task-failed" }, "Background agent task failed");
  });

  return Response.json({ taskId, conversationId });
}
