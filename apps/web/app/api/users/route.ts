import {
  assertCanManageUsers,
  createUser,
  createUserSchema,
  listUsers
} from "@spec-center/core";
import { fail, ok } from "../../../lib/http";
import { requireAuthenticatedUser } from "../../../lib/session";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    assertCanManageUsers(actor);
    return ok(await listUsers());
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    assertCanManageUsers(actor);
    const payload = createUserSchema.parse(await request.json());
    return ok(await createUser(payload), 201);
  } catch (error) {
    return fail(error);
  }
}
