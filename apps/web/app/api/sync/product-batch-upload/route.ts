import { syncBatch, syncBatchPayloadSchema } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    const payload = syncBatchPayloadSchema.parse(await request.json());
    payload.items.forEach((item) => {
      if (item.scope !== "product") {
        throw new Error("All items must use product scope.");
      }
    });
    return ok(await syncBatch(payload.items));
  } catch (error) {
    return fail(error);
  }
}
