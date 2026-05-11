import { NextResponse } from "next/server";
import { projectCookieName } from "../../lib/project";
import { authCookieName, isSecureCookie } from "../../lib/session";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));

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
