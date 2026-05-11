import { aiBriefSchema, getSpecIssues } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const payload = aiBriefSchema.parse(await request.json());
    return ok(await getSpecIssues(payload.specId, payload.sessionId, actor));
  } catch (error) {
    return fail(error);
  }
}
