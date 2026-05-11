import { getReviewSession } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(_request);
    const { sessionId } = await params;
    const session = await getReviewSession(sessionId, actor);
    return session ? ok(session) : fail(new Error("Review session not found."), 404);
  } catch (error) {
    return fail(error, 401);
  }
}
