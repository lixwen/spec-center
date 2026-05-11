import { NextResponse } from "next/server";
import { localeCookieName, normalizeLocale } from "../../../../lib/i18n";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const locale = normalizeLocale(payload?.locale);
  const response = NextResponse.json({ locale });

  response.cookies.set(localeCookieName, locale, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/"
  });

  return response;
}
