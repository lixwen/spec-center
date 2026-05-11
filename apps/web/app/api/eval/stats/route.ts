import { NextResponse } from "next/server";
import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../lib/session";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPlatformAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));

  const collections = await getMongoCollections();
  const docs = await collections.evalRuns.find({}).sort({ runAt: -1 }).limit(limit).toArray();
  const runs = docs.map((r) => ({
    passRate: r.passRate,
    avgScore: r.avgScore,
    byEvaluator: r.byEvaluator,
    byCategory: r.byCategory,
    runAt: r.runAt,
    model: r.model
  }));

  return NextResponse.json({ runs });
}
