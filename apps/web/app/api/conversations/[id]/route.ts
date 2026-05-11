import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest } from "../../../../lib/session";

export async function GET(
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

  return Response.json(conversation);
}

export async function DELETE(
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

  await collections.conversations.deleteOne({ _id: id });

  return Response.json({ deleted: true });
}
