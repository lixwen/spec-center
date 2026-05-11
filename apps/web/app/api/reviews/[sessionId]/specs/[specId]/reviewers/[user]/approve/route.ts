import { reviewerApproveSpec } from "@spec-center/core";
import { fail, ok } from "../../../../../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../../../../../lib/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string; specId: string; user: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(_request);
    const { sessionId, specId, user } = await params;
    return ok(await reviewerApproveSpec(sessionId, specId, decodeURIComponent(user), actor));
  } catch (error) {
    return fail(error);
  }
}
