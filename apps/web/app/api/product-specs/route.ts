import { listProductSpecs } from "@spec-center/core";
import { fail, ok } from "../../../lib/http";
import { getActiveProjectId } from "../../../lib/project";
import { requireAuthenticatedUser } from "../../../lib/session";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const projectId = await getActiveProjectId(actor);
    if (!projectId) {
      return fail(new Error("No active project"), 400);
    }
    return ok(await listProductSpecs(projectId));
  } catch (error) {
    return fail(error, 401);
  }
}
