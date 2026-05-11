import {
  deleteProject,
  getProject,
  updateProject,
  updateProjectSchema
} from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(_request);
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return fail(new Error("Project not found."), 404);
    }
    if (
      !actor.global_roles.includes("platform_admin") &&
      !actor.memberships.some((membership) => membership.project_id === project._id)
    ) {
      return fail(new Error("Project access denied."), 403);
    }
    return ok(project);
  } catch (error) {
    return fail(error, 401);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    const payload = updateProjectSchema.parse(await request.json());
    return ok(await updateProject(id, payload, actor));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    return ok(await deleteProject(id, actor));
  } catch (error) {
    return fail(error);
  }
}
