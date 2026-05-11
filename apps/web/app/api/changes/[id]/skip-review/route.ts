import { skipReview } from "@spec-center/core";
import { fail, ok } from "../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    return ok(await skipReview(id, actor));
  } catch (error) {
    return fail(error);
  }
}
