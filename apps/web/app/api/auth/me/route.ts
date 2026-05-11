import { ok, fail } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function GET(request: Request) {
  try {
    return ok(await requireAuthenticatedUser(request));
  } catch (error) {
    return fail(error, 401);
  }
}
