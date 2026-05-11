import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("X-Request-Id", requestId);

  // Block POST to /register from being handled by the page route.
  // Cursor's MCP OAuth client sends POST /register for dynamic client registration
  // which would otherwise get a 200 HTML response from the register page.
  if (request.method === "POST" && request.nextUrl.pathname === "/register") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const res = NextResponse.json({ error: "Not an OAuth registration endpoint" }, { status: 404 });
      res.headers.set("X-Request-Id", requestId);
      return res;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = {
  matcher: ["/(.*)"]
};
