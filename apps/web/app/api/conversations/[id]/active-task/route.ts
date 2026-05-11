import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest } from "../../../../../lib/session";

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

  const task = await collections.agentTasks.findOne(
    { conversation_id: id, user_id: user._id, status: "running" },
    { projection: { _id: 1, status: 1, full_answer: 1, events: { $slice: -1 } } }
  );

  if (!task) {
    return Response.json({ active: false });
  }

  const lastSeq = task.events?.[0]?.seq ?? 0;
  return Response.json({ active: true, taskId: task._id, lastSeq });
}
