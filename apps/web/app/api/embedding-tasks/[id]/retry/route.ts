import { retryEmbeddingTask } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../../lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPlatformAdmin(user)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await retryEmbeddingTask(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Retry failed" },
      { status: 400 }
    );
  }
}
