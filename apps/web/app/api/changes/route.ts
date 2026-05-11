import { createChange, listChanges, createChangeSchema } from "@spec-center/core";
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
    return ok(await listChanges(projectId));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const payload = createChangeSchema.parse(await request.json());
    const projectId = payload.project_id ?? (await getActiveProjectId(actor));
    if (!projectId) {
      return fail(new Error("No active project"), 400);
    }
    const change = await createChange({
      ...payload,
      actor,
      created_by: actor.username,
      project_id: projectId
    });
    return ok(change, 201);
  } catch (error) {
    return fail(error);
  }
}
