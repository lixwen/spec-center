import { NextResponse } from "next/server";
import {
  createId,
  evalExampleSchema,
  getMongoCollections,
  nowIso,
  type EvalDataset
} from "@spec-center/core";
import { z } from "zod/v4";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../lib/session";

const createBodySchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  examples: z.array(evalExampleSchema).optional()
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

export async function GET(request: Request) {
  const gate = await requirePlatformAdmin(request);
  if (gate.response) return gate.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  const collections = await getMongoCollections();
  const [items, total] = await Promise.all([
    collections.evalDatasets
      .aggregate([
        { $sort: { updatedAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $addFields: {
            exampleCount: { $size: { $ifNull: ["$examples", []] } }
          }
        },
        { $project: { examples: 0 } }
      ])
      .toArray(),
    collections.evalDatasets.countDocuments({})
  ]);

  return NextResponse.json({ items, total, page, limit });
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

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { name, category, description, examples } = parsed.data;
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
    description,
    examples: examples ?? [],
    createdAt: ts,
    updatedAt: ts,
    createdBy: gate.user._id
  };

  await collections.evalDatasets.insertOne(doc);
  return NextResponse.json(doc);
}
