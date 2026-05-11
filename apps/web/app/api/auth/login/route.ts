import { listProjectCatalog, loginSchema } from "@spec-center/core";
import { NextResponse } from "next/server";
import { createLoginSession, authCookieName, isSecureCookie } from "../../../../lib/session";
import { projectCookieName, selectAccessibleProject } from "../../../../lib/project";
import { fail, ok } from "../../../../lib/http";

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const session = await createLoginSession(payload.username, payload.password);
    const response = ok({ user: session.user });
    const cookieHeader = request.headers.get("cookie") ?? "";
    const savedProjectId = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${projectCookieName}=`))
      ?.slice(projectCookieName.length + 1);
    const projects = await listProjectCatalog(session.user);
    const activeProject = selectAccessibleProject(projects, savedProjectId);

    response.cookies.set(authCookieName, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      maxAge: 60 * 60 * 8,
      path: "/"
    });
    if (activeProject) {
      response.cookies.set(projectCookieName, activeProject._id, {
        httpOnly: false,
        sameSite: "lax",
        secure: isSecureCookie,
        maxAge: 60 * 60 * 24 * 30,
        path: "/"
      });
    }
    return response;
  } catch (error) {
    return fail(error, 401);
  }
}
