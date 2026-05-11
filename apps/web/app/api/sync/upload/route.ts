import { syncUpload, syncUploadPayloadSchema } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    const payload = syncUploadPayloadSchema.parse(await request.json());
    return ok(await syncUpload(payload));
  } catch (error) {
    return fail(error);
  }
}
