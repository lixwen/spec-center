import { updateComment, updateCommentSchema } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    const payload = updateCommentSchema.parse(await request.json());
    return ok(await updateComment(id, payload.status, actor));
  } catch (error) {
    return fail(error);
  }
}
