import { reviewerApprove } from "@spec-center/core";
import { fail, ok } from "../../../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../../../lib/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string; user: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(_request);
    const { sessionId, user } = await params;
    return ok(await reviewerApprove(sessionId, decodeURIComponent(user), actor));
  } catch (error) {
    return fail(error);
  }
}
