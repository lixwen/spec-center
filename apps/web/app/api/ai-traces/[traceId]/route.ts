import { NextResponse } from "next/server";
import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ traceId: string }> }) {
  const user = await getAuthenticatedUserForRequest(_request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPlatformAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { traceId } = await params;
  const collections = await getMongoCollections();
  const trace = await collections.aiTraces.findOne({ traceId });
  if (!trace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const spans = await collections.aiSpans.find({ traceId }).sort({ startTime: 1 }).toArray();
  return NextResponse.json({ trace, spans });
}
