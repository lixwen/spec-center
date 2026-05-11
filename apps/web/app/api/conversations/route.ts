import { getMongoCollections, createId, nowIso } from "@spec-center/core";
import { getAuthenticatedUserForRequest } from "../../../lib/session";
import { getActiveProjectId } from "../../../lib/project";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? (await getActiveProjectId(user));
  if (!projectId) {
    return Response.json({ error: "No active project" }, { status: 400 });
  }

  const collections = await getMongoCollections();
  const conversations = await collections.conversations
    .find(
      { user_id: user._id, project_id: projectId },
      { projection: { messages: 0 } }
    )
    .sort({ updated_at: -1 })
    .limit(50)
    .toArray();

  return Response.json({ items: conversations });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { projectId?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const projectId = body.projectId ?? (await getActiveProjectId(user));
  if (!projectId) {
    return Response.json({ error: "No active project" }, { status: 400 });
  }

  const timestamp = nowIso();
  const conversation = {
    _id: createId("conv"),
    project_id: projectId,
    user_id: user._id,
    title: body.title ?? "New Conversation",
    messages: [],
    created_at: timestamp,
    updated_at: timestamp
  };

  const collections = await getMongoCollections();
  await collections.conversations.insertOne(conversation);

  return Response.json(conversation, { status: 201 });
}
