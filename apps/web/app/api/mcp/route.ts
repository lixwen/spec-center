import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "../../../lib/mcp-server";
import {
  authenticateByApiToken,
  isApiToken,
  ensureMongoBootstrap,
  type AuthenticatedUser
} from "@spec-center/core";

async function authenticateRequest(request: Request): Promise<AuthenticatedUser | null> {
  await ensureMongoBootstrap();
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!isApiToken(token)) return null;
  try {
    return await authenticateByApiToken(token);
  } catch {
    return null;
  }
}

function jsonRpcError(code: number, message: string, httpStatus: number) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
    { status: httpStatus, headers: { "Content-Type": "application/json" } }
  );
}

// The MCP SDK does a strict string-includes check for "application/json" AND
// "text/event-stream" in the Accept header. Many clients send "Accept: *\/*"
// or omit it entirely, which fails the check. Normalise before calling the SDK.
function ensureMcpAcceptHeader(req: Request): Request {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) {
    return req;
  }
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  return new Request(req.url, { method: req.method, headers });
}

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return jsonRpcError(-32000, "Authentication required. Provide a valid API token via Authorization: Bearer osc_xxx", 401);
  }

  const server = createMcpServer(user);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  await server.connect(transport);

  try {
    const body = await request.json();
    const patchedReq = ensureMcpAcceptHeader(request);
    const response = await transport.handleRequest(patchedReq, { parsedBody: body });

    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      // SSE stream: defer cleanup until the stream body is fully consumed.
      // We wrap the original ReadableStream so that when the client disconnects
      // or the stream ends, transport + server are properly closed.
      const original = response.body;
      if (original) {
        const wrapped = new ReadableStream({
          async start(controller) {
            const reader = original.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            } finally {
              controller.close();
              await transport.close();
              await server.close();
            }
          },
          cancel() {
            transport.close();
            server.close();
          }
        });
        return new Response(wrapped, {
          status: response.status,
          headers: response.headers
        });
      }
    }

    await transport.close();
    await server.close();
    return response;
  } catch (err) {
    await transport.close();
    await server.close();
    return jsonRpcError(
      -32603,
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
}

export async function GET() {
  return jsonRpcError(-32000, "Method not allowed. Stateless server does not support GET SSE streams.", 405);
}

export async function DELETE() {
  return jsonRpcError(-32000, "Method not allowed. Stateless server does not support session termination.", 405);
}
