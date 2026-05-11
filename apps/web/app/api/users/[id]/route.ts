import {
  assertCanManageUsers,
  getUser,
  updateUser,
  updateUserSchema
} from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    assertCanManageUsers(actor);
    const { id } = await params;
    const user = await getUser(id);
    return user ? ok(user) : fail(new Error("User not found."), 404);
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
    assertCanManageUsers(actor);
    const { id } = await params;
    const payload = updateUserSchema.parse(await request.json());
    return ok(await updateUser(id, payload));
  } catch (error) {
    return fail(error);
  }
}
