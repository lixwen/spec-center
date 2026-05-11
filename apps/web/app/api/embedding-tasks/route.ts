import { getEmbeddingTaskStats, listEmbeddingTasks } from "@spec-center/core";
import { getAuthenticatedUserForRequest } from "../../../lib/session";
import { isPlatformAdmin } from "../../../lib/session";
import { getActiveProjectId } from "../../../lib/project";

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));

  const [stats, list] = await Promise.all([
    getEmbeddingTaskStats(projectId),
    listEmbeddingTasks(projectId, { status, page, pageSize })
  ]);

  return Response.json({ stats, items: list.items, total: list.total, page, pageSize });
}
