import {
  createProject,
  createProjectSchema,
  listProjectCatalog
} from "@spec-center/core";
import { fail, ok } from "../../../lib/http";
import { requireAuthenticatedUser } from "../../../lib/session";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    return ok(await listProjectCatalog(actor));
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const payload = createProjectSchema.parse(await request.json());
    return ok(await createProject({ ...payload, actor }), 201);
  } catch (error) {
    return fail(error);
  }
}
