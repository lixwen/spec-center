import { getSyncStatus } from "@spec-center/core";
import { fail, ok } from "../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ changeId: string }> }
) {
  try {
    await requireAuthenticatedUser(_request);
    const { changeId } = await params;
    return ok(await getSyncStatus(changeId));
  } catch (error) {
    return fail(error);
  }
}
