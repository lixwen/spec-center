import {
  createComment,
  createCommentSchema,
  getComments
} from "@spec-center/core";
import { fail, ok } from "../../../../../../../lib/http";
import { requireAuthenticatedUser } from "../../../../../../../lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string; specId: string }> }
) {
  try {
    await requireAuthenticatedUser(_request);
    const { sessionId, specId } = await params;
    return ok(await getComments(sessionId, specId));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; specId: string }> }
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { sessionId, specId } = await params;
    const payload = createCommentSchema.parse(await request.json());
    return ok(
      await createComment({
        actor,
        sessionId,
        specId,
        author: actor.username,
        content: payload.content,
        anchor: payload.anchor
      }),
      201
    );
  } catch (error) {
    return fail(error);
  }
}
