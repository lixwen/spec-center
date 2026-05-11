import { archiveChange } from "@spec-center/core";
import { fail, ok } from "../../../../../lib/http";
import { getRequestMessages } from "../../../../../lib/locale";
import { requireAuthenticatedUser } from "../../../../../lib/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(_request);
    const { messages } = await getRequestMessages();
    const { id } = await params;
    const change = await archiveChange(id, actor);
    return ok({
      change,
      guidance: messages.api.archiveGuidance
    });
  } catch (error) {
    return fail(error);
  }
}
