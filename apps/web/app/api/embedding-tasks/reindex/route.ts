import { reindexProject } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../lib/session";
import { getActiveProjectId } from "../../../../lib/project";

export async function POST(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPlatformAdmin(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const projectId = await getActiveProjectId(user);
  if (!projectId) {
    return Response.json({ error: "No active project" }, { status: 400 });
  }

  const taskCount = await reindexProject(projectId);
  return Response.json({ taskCount });
}
