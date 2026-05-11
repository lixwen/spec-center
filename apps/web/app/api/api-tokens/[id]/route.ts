import { revokeApiToken } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    await revokeApiToken(id, actor._id);
    return ok({ revoked: true });
  } catch (error) {
    return fail(error);
  }
}
