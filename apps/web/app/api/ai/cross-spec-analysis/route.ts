import { aiCrossSpecSchema, getCrossSpecIssues } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const payload = aiCrossSpecSchema.parse(await request.json());
    return ok(await getCrossSpecIssues(payload.changeId, actor));
  } catch (error) {
    return fail(error);
  }
}
