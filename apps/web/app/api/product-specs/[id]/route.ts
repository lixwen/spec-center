import { getProductSpec, getSnapshot, updateProductSpec, deleteProductSpec } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser(request);
    const { id } = await params;
    const spec = await getProductSpec(id);
    if (!spec) {
      return fail(new Error("Product spec not found."), 404);
    }
    const content = spec.working_snapshot_id ? await getSnapshot(spec.working_snapshot_id) : null;
    return ok({ ...spec, content });
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
    const spec = await getProductSpec(id);
    if (!spec) {
      return fail(new Error("Product spec not found."), 404);
    }
    const payload = (await request.json()) as Partial<typeof spec>;
    return ok(await updateProductSpec(id, payload, actor));
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
    await deleteProductSpec(id, actor);
    return new Response(null, { status: 204 });
  } catch (error) {
    return fail(error);
  }
}
