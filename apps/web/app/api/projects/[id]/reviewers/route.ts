import {
  getProjectReviewers,
  updateProjectReviewers,
  updateProjectReviewersSchema
} from "@spec-center/core";
import { fail, ok } from "../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    return ok(await getProjectReviewers(id, actor));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    const payload = updateProjectReviewersSchema.parse(await request.json());
    return ok(await updateProjectReviewers(id, payload.reviewers, actor));
  } catch (error) {
    return fail(error);
  }
}
