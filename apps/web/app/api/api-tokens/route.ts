import { createApiToken, createApiTokenSchema, listApiTokens } from "@spec-center/core";
import { fail, ok } from "../../../lib/http";
import { requireAuthenticatedUser } from "../../../lib/session";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    return ok(await listApiTokens(actor._id));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const payload = createApiTokenSchema.parse(await request.json());
    const { token, rawToken } = await createApiToken(actor._id, payload.name);
    const { token_hash: _, ...safe } = token;
    return ok({ ...safe, token: rawToken }, 201);
  } catch (error) {
    return fail(error);
  }
}
