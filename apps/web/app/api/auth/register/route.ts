import { registerSchema, registerUser } from "@spec-center/core";
import { fail, ok } from "../../../../lib/http";
import { authCookieName, isSecureCookie } from "../../../../lib/session";

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());
    const { user, token } = await registerUser(payload);
    const response = ok({ user }, 201);

    response.cookies.set(authCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureCookie,
      maxAge: 60 * 60 * 8,
      path: "/"
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already taken") || message.includes("already in use")) {
      return fail(error, 409);
    }
    return fail(error);
  }
}
