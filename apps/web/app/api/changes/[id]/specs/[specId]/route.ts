import { getSpec, deleteChangeSpec } from "@spec-center/core";
import { fail } from "../../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../../lib/session";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; specId: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id, specId } = await params;
    const spec = await getSpec(specId);

    if (!spec || spec.change_id !== id) {
      return fail(new Error("Spec not found for this change."), 404);
    }

    await deleteChangeSpec(specId, actor);
    return new Response(null, { status: 204 });
  } catch (error) {
    return fail(error);
  }
}
