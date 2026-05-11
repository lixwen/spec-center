import { NextResponse } from "next/server";
import {
  createId,
  getChatModel,
  getMongoCollections,
  nowIso,
  type EvalConfig,
  type EvalRun
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

const triggerBodySchema = z.object({
  category: z.string().optional(),
  evaluators: z.array(z.string().min(1)).optional(),
  codeOnly: z.boolean().optional(),
  mode: z.enum(["trace", "agent"]).optional(),
  traceId: z.string().optional(),
  defaultProjectIds: z.array(z.string()).optional()
});

function syntheticEvalConfig(updatedAt: string): EvalConfig {
  return {
    _id: "eval-config-default",
    evaluators: BUILTIN_EVALUATOR_NAMES.map((name) => ({ name, enabled: true })),
    defaultPassThreshold: 0.7,
    updatedAt,
    updatedBy: ""
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

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin(request);
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = triggerBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  if (parsed.data.mode === "trace" && !parsed.data.traceId?.trim()) {
    return NextResponse.json({ error: "traceId is required when mode is trace" }, { status: 400 });
  }

  const collections = await getMongoCollections();

  const concurrent = await collections.evalRuns.findOne({ status: "running" });
  if (concurrent) {
    return NextResponse.json({ error: "An evaluation run is already in progress" }, { status: 409 });
  }

  const runId = createId("evalrun");
  const now = nowIso();
  const stub: EvalRun = {
    _id: runId,
    runId,
    runAt: now,
    datasetVersion: "pending",
    model: getChatModel(),
    totalExamples: 0,
    passRate: 0,
    avgScore: 0,
    byCategory: {},
    byEvaluator: {},
    status: "running",
    progress: {
      completedExamples: 0,
      totalExamples: 0,
      startedAt: now
    },
    createdAt: now
  };

  await collections.evalRuns.insertOne(stub);

  const storedConfig = await collections.evalConfigs.findOne({});
  const evalConfig = storedConfig ?? syntheticEvalConfig(now);

  void (async () => {
    try {
      const { runEvaluation } = await import("@spec-center/core");
      await runEvaluation({
        runId,
        category: parsed.data.category,
        datasetSource: "mongo",
        codeOnly: parsed.data.codeOnly,
        evaluatorNames: parsed.data.evaluators,
        evalConfig,
        mode: parsed.data.mode,
        traceId: parsed.data.mode === "trace" ? parsed.data.traceId?.trim() : undefined,
        defaultProjectIds: parsed.data.defaultProjectIds
      });
    } catch {
      // `runEvaluation` persists `failed` when possible
    }
  })();

  return NextResponse.json({ runId });
}
