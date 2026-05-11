import { upsertOpenSpecChangesFromPayload } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    const payload = await request.json();
    const result = await upsertOpenSpecChangesFromPayload(payload);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
