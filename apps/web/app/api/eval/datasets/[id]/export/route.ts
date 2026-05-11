import { NextResponse } from "next/server";
import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../../../lib/session";

function exportFilename(name: string, category: string): string {
  const raw = (name?.trim() || category || "dataset").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return `${raw || "dataset"}.json`;
}

async function requirePlatformAdmin(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  if (!isPlatformAdmin(user)) {
    return { user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePlatformAdmin(request);
  if (gate.response) return gate.response;

  const { id } = await params;
  const collections = await getMongoCollections();
  const doc = await collections.evalDatasets.findOne(
    { _id: id },
    { projection: { examples: 1, name: 1, category: 1 } }
  );

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = new TextEncoder().encode(JSON.stringify(doc.examples ?? [], null, 2));
  const filename = exportFilename(doc.name, doc.category);

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    }
  });
}
