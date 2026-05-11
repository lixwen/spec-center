import { NextResponse } from "next/server";
import {
  createId,
  getMongoCollections,
  nowIso,
  type EvalConfig
} from "@spec-center/core";
import { z } from "zod/v4";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../lib/session";

const BUILTIN_EVALUATOR_NAMES = [
  "tool-selection",
  "trajectory-efficiency",
  "cost-threshold",
  "keyword-coverage",
  "llm-judge"
] as const;

const paramValueSchema = z.union([z.number(), z.string(), z.boolean()]);

const evalConfigEntrySchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  params: z.record(z.string(), paramValueSchema).optional()
});

const putBodySchema = z.object({
  evaluators: z.array(evalConfigEntrySchema),
  defaultPassThreshold: z.number().min(0).max(1)
});

function defaultConfigResponse(): Pick<EvalConfig, "evaluators" | "defaultPassThreshold"> {
  return {
    evaluators: BUILTIN_EVALUATOR_NAMES.map((name) => ({ name, enabled: true })),
    defaultPassThreshold: 0.7
  };
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

export async function GET(request: Request) {
  const gate = await requirePlatformAdmin(request);
  if (gate.response) return gate.response;

  const collections = await getMongoCollections();
  const doc = await collections.evalConfigs.findOne({});

  if (!doc) {
    return NextResponse.json(defaultConfigResponse());
  }

  return NextResponse.json(doc);
}

export async function PUT(request: Request) {
  const gate = await requirePlatformAdmin(request);
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const collections = await getMongoCollections();
  const existing = await collections.evalConfigs.findOne({});
  const ts = nowIso();

  const doc: EvalConfig = {
    _id: existing?._id ?? createId("evalconfig"),
    evaluators: parsed.data.evaluators,
    defaultPassThreshold: parsed.data.defaultPassThreshold,
    updatedAt: ts,
    updatedBy: gate.user._id
  };

  await collections.evalConfigs.replaceOne({ _id: doc._id }, doc, { upsert: true });
  return NextResponse.json(doc);
}
