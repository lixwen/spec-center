const body = JSON.stringify({ error: "Not found" });
const headers = { "Content-Type": "application/json" };

export async function GET() {
  return new Response(body, { status: 404, headers });
}

export async function POST() {
  return new Response(body, { status: 404, headers });
}
