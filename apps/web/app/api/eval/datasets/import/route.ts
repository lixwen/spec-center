import { NextResponse } from "next/server";
import {
  createId,
  evalExampleSchema,
  getMongoCollections,
  nowIso,
  type EvalDataset
} from "@spec-center/core";
import { z } from "zod/v4";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../../lib/session";

const importBodySchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
  examples: z.array(evalExampleSchema)
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

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin(request);
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = importBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { category, name, examples } = parsed.data;
  const collections = await getMongoCollections();

  const existing = await collections.evalDatasets.findOne({ category });
  if (existing) {
    return NextResponse.json({ error: "Category already exists" }, { status: 409 });
  }

  const ts = nowIso();
  const doc: EvalDataset = {
    _id: createId("evaldataset"),
    name,
    category,
    examples,
    createdAt: ts,
    updatedAt: ts,
    createdBy: gate.user._id
  };

  await collections.evalDatasets.insertOne(doc);
  return NextResponse.json(doc);
}
