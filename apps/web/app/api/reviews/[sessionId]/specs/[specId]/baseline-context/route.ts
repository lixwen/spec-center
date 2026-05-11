import { getBaselineContext } from "@spec-center/core";
import { fail, ok } from "../../../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../../../lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string; specId: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(_request);
    const { sessionId, specId } = await params;
    return ok(await getBaselineContext(sessionId, specId, actor));
  } catch (error) {
    return fail(error);
  }
}
