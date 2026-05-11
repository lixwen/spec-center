import { NextResponse } from "next/server";
import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../../../lib/session";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPlatformAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { runId } = await params;
  const collections = await getMongoCollections();
  const run = await collections.evalRuns.findOne({ runId });
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: run.status,
    progress: run.progress,
    passRate: run.passRate,
    avgScore: run.avgScore,
    error: run.error
  });
}
