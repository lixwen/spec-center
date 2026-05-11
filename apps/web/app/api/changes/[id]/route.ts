import { getChange, updateChange, updateChangeSchema, deleteChange } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser(request);
    const { id } = await params;
    const change = await getChange(id);
    return change ? ok(change) : fail(new Error("Change not found."), 404);
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
    const payload = updateChangeSchema.parse(await request.json());
    return ok(await updateChange(id, payload, actor));
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
    await deleteChange(id, actor);
    return new Response(null, { status: 204 });
  } catch (error) {
    return fail(error);
  }
}
