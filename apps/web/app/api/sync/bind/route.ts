import { bindRepoChange, bindSchema } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    const payload = bindSchema.parse(await request.json());
    return ok(await bindRepoChange(payload));
  } catch (error) {
    return fail(error);
  }
}
