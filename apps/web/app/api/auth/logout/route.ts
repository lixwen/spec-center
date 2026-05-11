import { NextResponse } from "next/server";
import { projectCookieName } from "../../../../lib/project";
import { authCookieName, isSecureCookie } from "../../../../lib/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie,
    maxAge: 0,
    path: "/"
  });
  response.cookies.set(projectCookieName, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: isSecureCookie,
    maxAge: 0,
    path: "/"
  });
  return response;
}
