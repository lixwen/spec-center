import { listProjectCatalog } from "@spec-center/core";
import { NextResponse } from "next/server";
import { projectCookieName } from "../../../../lib/project";
import { requireAuthenticatedUser } from "../../../../lib/session";

export async function POST(request: Request) {
  const actor = await requireAuthenticatedUser(request);
  const payload = await request.json().catch(() => ({}));
  const projects = await listProjectCatalog(actor);
  const projectId =
    projects.find((project) => project._id === payload?.projectId)?._id ?? projects[0]?._id ?? "";
  const response = NextResponse.json({ projectId });

  response.cookies.set(projectCookieName, projectId, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/"
  });

  return response;
}
