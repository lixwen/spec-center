import { NextResponse } from "next/server";
import { getMongoDb, getQdrantClient } from "@spec-center/core";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    checks.mongodb = "ok";
  } catch {
    checks.mongodb = "error";
  }

  try {
    await getQdrantClient().getCollections();
    checks.qdrant = "ok";
  } catch {
    checks.qdrant = "error";
  }

  const ok = Object.values(checks).every((s) => s === "ok");
  return NextResponse.json(
    { status: ok ? "ready" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  );
}
