import { NextResponse } from "next/server";
import { evalExampleSchema, getMongoCollections, nowIso, type EvalDataset } from "@spec-center/core";
import { z } from "zod/v4";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../../lib/session";

const updateBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    examples: z.array(evalExampleSchema).optional()
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.examples !== undefined, {
    message: "At least one of name, description, examples is required"
  });

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
  const doc = await collections.evalDatasets.findOne({ _id: id });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePlatformAdmin(request);
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { id } = await params;
  const collections = await getMongoCollections();
  const existing = await collections.evalDatasets.findOne({ _id: id });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, description, examples } = parsed.data;
  const next: EvalDataset = {
    ...existing,
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(examples !== undefined ? { examples } : {}),
    updatedAt: nowIso()
  };

  await collections.evalDatasets.replaceOne({ _id: id }, next);
  return NextResponse.json(next);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePlatformAdmin(request);
  if (gate.response) return gate.response;

  const { id } = await params;
  const collections = await getMongoCollections();
  const res = await collections.evalDatasets.deleteOne({ _id: id });
  if (res.deletedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
