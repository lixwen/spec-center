import { listProductSpecs } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { getActiveProjectId } from "../../../../lib/project";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const projectId = await getActiveProjectId(actor);
    if (!projectId) {
      return fail(new Error("No active project"), 400);
    }
    const capability = new URL(request.url).searchParams.get("capability");
    const allSpecs = await listProductSpecs(projectId);
    const specs = capability
      ? allSpecs.filter((spec) => spec.capability === capability)
      : allSpecs;
    return ok(specs);
  } catch (error) {
    return fail(error, 401);
  }
}
