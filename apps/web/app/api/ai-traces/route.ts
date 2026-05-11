import { NextResponse } from "next/server";
import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../lib/session";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPlatformAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
  const status = searchParams.get("status") ?? undefined;
  const projectId = searchParams.get("projectId") ?? undefined;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const collections = await getMongoCollections();
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (projectId) filter.projectIds = projectId;
  if (from || to) {
    const range: Record<string, string> = {};
    if (from) range.$gte = new Date(from).toISOString();
    if (to) range.$lte = new Date(to).toISOString();
    filter.createdAt = range;
  }

  const [items, total] = await Promise.all([
    collections.aiTraces
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    collections.aiTraces.countDocuments(filter)
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
