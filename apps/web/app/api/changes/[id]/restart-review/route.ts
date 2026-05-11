import { restartReview } from "@spec-center/core";
import { fail, ok } from "../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../lib/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(_request);
    const { id } = await params;
    return ok(await restartReview(id, actor));
  } catch (error) {
    return fail(error);
  }
}
