import { startReview, startReviewSchema } from "@spec-center/core";
import { fail, ok } from "../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const payload = startReviewSchema.parse(body);
    return ok(await startReview(id, payload.reviewers ?? [], actor));
  } catch (error) {
    return fail(error);
  }
}
