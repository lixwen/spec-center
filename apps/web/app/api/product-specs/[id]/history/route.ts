import { getProductSpec, getSpecSnapshots } from "@spec-center/core";
import { fail, ok } from "../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../lib/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthenticatedUser(request);
    const { id } = await params;
    const spec = await getProductSpec(id);
    if (!spec) {
      return fail(new Error("Product spec not found."), 404);
    }
    return ok(await getSpecSnapshots(spec._id));
  } catch (error) {
    return fail(error, 401);
  }
}
