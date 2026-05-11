import { getMongoCollections } from "../data/mongo";
import type {
  AITrace,
  AISpan,
  EvalConfig,
  EvalExample,
  EvalResultDoc,
  EvalRun,
  EvalRunProgress
} from "../domain/models";
import { AITraceCollector } from "../services/ai-trace-collector";
import { getChatModel, queryRagStream } from "../services/rag-service";
import { createId } from "../utils/id";
import { nowIso } from "../utils/hash";
import { createLogger } from "../utils/logger";
import { computeDatasetVersion, loadDataset } from "./dataset-loader";
import type { Evaluator } from "./evaluator";
import { getAllCodeEvaluators } from "./evaluators/index";
import { llmJudgeEvaluator } from "./evaluators/llm-judge";

const logger = createLogger("eval-runner");

export type EvalMode = "trace" | "agent";

export interface EvalRunOptions {
  category?: string;
  /** Where to load eval examples from (default `"file"` for CLI). */
  datasetSource?: "mongo" | "file";
  /** "trace" = replay existing trace; "agent" = call agent API per example; default = placeholder */
  mode?: EvalMode;
  traceId?: string;
  /** For agent mode: default project IDs to use when example lacks context.projectIds */
  defaultProjectIds?: string[];
  evaluatorName?: string;
  /** Restrict to these evaluator names (after single-name and config filters). */
  evaluatorNames?: string[];
  codeOnly?: boolean;
  evalConfig?: EvalConfig;
  /**
   * When set (e.g. API trigger inserted a `running` stub), this id is used and the initial
   * insert is skipped; progress and final stats update the existing row.
   */
  runId?: string;
  /** Called after each example finishes all evaluators (Web progress); optional for CLI. */
  onProgress?: (progress: EvalRunProgress) => Promise<void>;
}

export interface GatheredEvaluator {
  evaluator: Evaluator;
  params?: Record<string, number | string | boolean>;
}

function mergeEvaluatorParams(
  ev: Evaluator,
  configParams?: Record<string, number | string | boolean>,
  passThreshold?: number
): Record<string, number | string | boolean> | undefined {
  const base = ev.defaultParams;
  const hasThreshold = passThreshold !== undefined;
  if (!base && !configParams && !hasThreshold) return undefined;
  const merged = { ...base, ...configParams };
  if (hasThreshold && merged.passThreshold === undefined) {
    merged.passThreshold = passThreshold;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export async function callAgentForEval(
  example: EvalExample,
  defaultProjectIds?: string[]
): Promise<{ traceId: string; output: string }> {
  const projectIds = example.context?.projectIds ?? defaultProjectIds ?? [];
  const collector = new AITraceCollector({
    conversationId: createId("eval-conv"),
    taskId: createId("eval-task"),
    projectIds,
    userId: "eval-system",
    model: getChatModel()
  });
  try {
    let fullAnswer = "";
    for await (const event of queryRagStream(example.input, projectIds, [], undefined, collector)) {
      if (event.type === "token" && event.content) {
        fullAnswer += event.content;
      }
    }
    await collector.flush("completed");
    return { traceId: collector.traceId, output: fullAnswer };
  } catch (err) {
    await collector.flush("error");
    throw err;
  }
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function gatherEvaluators(options: EvalRunOptions): GatheredEvaluator[] {
  const code = getAllCodeEvaluators();
  const fullList: Evaluator[] = options.codeOnly ? [...code] : [...code, llmJudgeEvaluator];
  let list = fullList;
  if (options.evaluatorName) {
    list = list.filter((e) => e.name === options.evaluatorName);
  }

  if (options.evaluatorNames && options.evaluatorNames.length > 0) {
    const allowed = new Set(options.evaluatorNames);
    list = list.filter((e) => allowed.has(e.name));
  }

  const passThreshold = options.evalConfig?.defaultPassThreshold;

  if (!options.evalConfig) {
    return list.map((evaluator) => ({
      evaluator,
      params: mergeEvaluatorParams(evaluator, undefined, passThreshold)
    }));
  }

  const byName = new Map(
    options.evalConfig.evaluators.filter((e) => e.enabled).map((e) => [e.name, e] as const)
  );

  return list
    .filter((e) => byName.has(e.name))
    .map((evaluator) => {
      const entry = byName.get(evaluator.name)!;
      const params = mergeEvaluatorParams(evaluator, entry.params, passThreshold);
      return { evaluator, params };
    });
}

function emptyTrace(): AITrace {
  return {
    _id: "eval-placeholder",
    traceId: "eval-placeholder",
    conversationId: "",
    taskId: "",
    projectIds: [],
    model: "",
    totalDurationMs: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    agentRounds: 0,
    toolCallCount: 0,
    ragChunkCount: 0,
    status: "completed",
    createdAt: nowIso()
  };
}

async function loadTraceContext(traceId: string): Promise<{
  trace: AITrace;
  spans: AISpan[];
  agentOutput: string;
}> {
  const cols = await getMongoCollections();
  const trace = await cols.aiTraces.findOne({ traceId });
  if (!trace) {
    throw new Error(`Trace not found: ${traceId}`);
  }
  const spans = await cols.aiSpans.find({ traceId }).sort({ startTime: 1 }).toArray();
  const task = await cols.agentTasks.findOne({ _id: trace.taskId });
  const agentOutput = task?.full_answer ?? "";
  return { trace, spans, agentOutput };
}

function buildEvalRun(params: {
  runId: string;
  runAt: string;
  datasetVersion: string;
  model: string;
  examples: EvalExample[];
  resultDocs: EvalResultDoc[];
}): EvalRun {
  const { runId, runAt, datasetVersion, model, examples, resultDocs } = params;

  let passRate = 1;
  let avgScore = 0;

  if (examples.length > 0) {
    let examplePasses = 0;
    for (const ex of examples) {
      const rows = resultDocs.filter((r) => r.exampleId === ex.id);
      const allPass = rows.length > 0 && rows.every((r) => r.label === "pass");
      if (allPass) examplePasses++;
    }
    passRate = examplePasses / examples.length;
  }

  if (resultDocs.length > 0) {
    avgScore = mean(resultDocs.map((r) => r.score));
  }

  const byCategory: EvalRun["byCategory"] = {};
  const categories = [...new Set(examples.map((e) => e.category))];
  for (const cat of categories) {
    const exInCat = examples.filter((e) => e.category === cat);
    const ids = new Set(exInCat.map((e) => e.id));
    const catResults = resultDocs.filter((r) => ids.has(r.exampleId));
    let passed = 0;
    for (const ex of exInCat) {
      const rows = resultDocs.filter((r) => r.exampleId === ex.id);
      if (rows.length > 0 && rows.every((r) => r.label === "pass")) passed++;
    }
    byCategory[cat] = {
      count: exInCat.length,
      avgScore: mean(catResults.map((r) => r.score)),
      passRate: exInCat.length > 0 ? passed / exInCat.length : 1
    };
  }

  const byEvaluator: EvalRun["byEvaluator"] = {};
  const evaluatorNames = [...new Set(resultDocs.map((r) => r.evaluator))];
  for (const name of evaluatorNames) {
    const rows = resultDocs.filter((r) => r.evaluator === name);
    const passN = rows.filter((r) => r.label === "pass").length;
    byEvaluator[name] = {
      avgScore: mean(rows.map((r) => r.score)),
      passRate: rows.length > 0 ? passN / rows.length : 1
    };
  }

  const createdAt = nowIso();
  return {
    _id: runId,
    runId,
    runAt,
    datasetVersion,
    model,
    totalExamples: examples.length,
    passRate,
    avgScore,
    byCategory,
    byEvaluator,
    createdAt
  };
}

function padCell(s: string, w: number): string {
  const str = s.length > w ? `${s.slice(0, w - 1)}…` : s;
  return str.padEnd(w);
}

export function printEvalReport(run: EvalRun, results: EvalResultDoc[]): void {
  console.log("=== Evaluation Report ===");
  console.log("");
  console.log(`Run ID:        ${run.runId}`);
  console.log(`Run at:        ${run.runAt}`);
  console.log(`Dataset hash:  ${run.datasetVersion}`);
  console.log(`Model:         ${run.model}`);
  console.log("");
  console.log("Summary");
  console.log(`  Total examples: ${run.totalExamples}`);
  console.log(`  Pass rate:      ${(run.passRate * 100).toFixed(1)}%`);
  console.log(`  Avg score:      ${run.avgScore.toFixed(3)}`);
  console.log("");

  const catRows = Object.entries(run.byCategory).sort(([a], [b]) => a.localeCompare(b));
  if (catRows.length > 0) {
    console.log("By category");
    const wCat = 24;
    const wNum = 8;
    const hdr = `${padCell("category", wCat)} | ${padCell("count", wNum)} | ${padCell("pass%", wNum)} | avgScore`;
    console.log(hdr);
    console.log("-".repeat(hdr.length));
    for (const [cat, s] of catRows) {
      console.log(
        `${padCell(cat, wCat)} | ${padCell(String(s.count), wNum)} | ${padCell(`${(s.passRate * 100).toFixed(0)}%`, wNum)} | ${s.avgScore.toFixed(3)}`
      );
    }
    console.log("");
  }

  const evRows = Object.entries(run.byEvaluator).sort(([a], [b]) => a.localeCompare(b));
  if (evRows.length > 0) {
    console.log("By evaluator");
    const wEv = 24;
    const wNum = 10;
    const hdr = `${padCell("evaluator", wEv)} | ${padCell("avg score", wNum)} | ${padCell("pass%", wNum)}`;
    console.log(hdr);
    console.log("-".repeat(hdr.length));
    for (const [name, s] of evRows) {
      console.log(
        `${padCell(name, wEv)} | ${padCell(s.avgScore.toFixed(3), wNum)} | ${padCell(`${(s.passRate * 100).toFixed(0)}%`, wNum)}`
      );
    }
    console.log("");
  }

  const failed = results.filter((r) => r.label === "fail");
  if (failed.length > 0) {
    console.log("Failed examples (label=fail)");
    const wId = 20;
    const wEv = 18;
    const wSc = 8;
    const hdr = `${padCell("example id", wId)} | ${padCell("evaluator", wEv)} | ${padCell("score", wSc)} | reason`;
    console.log(hdr);
    console.log("-".repeat(Math.min(100, hdr.length + 20)));
    for (const r of failed) {
      const reason = (r.reason ?? "").replace(/\s+/g, " ").slice(0, 120);
      console.log(
        `${padCell(r.exampleId, wId)} | ${padCell(r.evaluator, wEv)} | ${padCell(String(r.score), wSc)} | ${reason}`
      );
    }
  } else {
    console.log("Failed examples: none");
  }
}

export async function runEvaluation(options: EvalRunOptions): Promise<EvalRun> {
  let runId: string | undefined = options.runId;

  try {
    const examples = await loadDataset(options.category, options.datasetSource ?? "file");
    runId = runId ?? createId("evalrun");
    const datasetVersion = computeDatasetVersion(examples);
    const evaluators = gatherEvaluators(options);
    const isAgentMode = options.mode === "agent";

    if (isAgentMode) {
      logger.info({ mode: "agent" }, "eval run mode");
    } else if (options.traceId) {
      logger.info({ mode: "trace", traceId: options.traceId }, "eval run mode");
    } else {
      logger.warn({ mode: "placeholder" }, "eval run mode: no trace id");
    }

    let preloadedTrace: { trace: AITrace; spans: AISpan[]; agentOutput: string } | undefined;
    if (options.traceId && !isAgentMode) {
      preloadedTrace = await loadTraceContext(options.traceId);
    }

    const runAt = nowIso();
    const startedAt = runAt;
    const model = getChatModel();
    const resultDocs: EvalResultDoc[] = [];

    const nextEvaluatorName = (exampleIndex: number): string => {
      if (exampleIndex + 1 >= examples.length || evaluators.length === 0) return "";
      return evaluators[0]!.evaluator.name;
    };

    const initialProgress: EvalRunProgress = {
      completedExamples: 0,
      totalExamples: examples.length,
      currentEvaluator: isAgentMode ? "calling agent..." : nextEvaluatorName(-1),
      startedAt
    };

    const runningDoc: EvalRun = {
      _id: runId,
      runId,
      runAt,
      datasetVersion,
      model,
      totalExamples: examples.length,
      passRate: 0,
      avgScore: 0,
      byCategory: {},
      byEvaluator: {},
      status: "running",
      progress: initialProgress,
      createdAt: nowIso()
    };

    const cols = await getMongoCollections();
    if (options.runId) {
      await cols.evalRuns.updateOne(
        { runId },
        {
          $set: {
            runAt,
            datasetVersion,
            model,
            totalExamples: examples.length,
            passRate: 0,
            avgScore: 0,
            byCategory: {},
            byEvaluator: {},
            status: "running",
            progress: initialProgress
          }
        }
      );
    } else {
      await cols.evalRuns.insertOne(runningDoc);
    }

    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i]!;
      let trace: AITrace;
      let spans: AISpan[];
      let agentOutput: string;
      let resultTraceId: string | undefined;

      if (isAgentMode) {
        const agentProgress: EvalRunProgress = {
          completedExamples: i,
          totalExamples: examples.length,
          currentEvaluator: "calling agent...",
          startedAt
        };
        if (options.onProgress) {
          await options.onProgress(agentProgress);
        }
        await cols.evalRuns.updateOne({ runId }, { $set: { progress: agentProgress } });

        logger.info({ exampleId: ex.id, exampleIndex: i }, "eval calling agent for example");
        const { traceId: agentTraceId, output } = await callAgentForEval(ex, options.defaultProjectIds);
        resultTraceId = agentTraceId;
        const loaded = await loadTraceContext(agentTraceId);
        trace = loaded.trace;
        spans = loaded.spans;
        agentOutput = output;
      } else if (preloadedTrace) {
        trace = preloadedTrace.trace;
        spans = preloadedTrace.spans;
        agentOutput = preloadedTrace.agentOutput;
        resultTraceId = options.traceId;
      } else {
        trace = emptyTrace();
        spans = [];
        agentOutput = "";
        resultTraceId = undefined;
      }

      for (const { evaluator: ev, params: evalParams } of evaluators) {
        const t0 = Date.now();
        try {
          const er = await ev.evaluate(trace, spans, ex, agentOutput, evalParams);
          resultDocs.push({
            _id: createId("evalresult"),
            runId,
            exampleId: ex.id,
            category: ex.category,
            evaluator: er.evaluator,
            score: er.score,
            label: er.label,
            reason: er.reason,
            traceId: resultTraceId,
            agentOutput: agentOutput ? agentOutput.slice(0, 20_000) : undefined,
            durationMs: Date.now() - t0,
            createdAt: nowIso()
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn({ err: msg, evaluator: ev.name, exampleId: ex.id }, "evaluator threw; recording fail");
          resultDocs.push({
            _id: createId("evalresult"),
            runId,
            exampleId: ex.id,
            category: ex.category,
            evaluator: ev.name,
            score: 0,
            label: "fail",
            reason: `evaluator error: ${msg}`,
            traceId: resultTraceId,
            agentOutput: agentOutput ? agentOutput.slice(0, 20_000) : undefined,
            durationMs: Date.now() - t0,
            createdAt: nowIso()
          });
        }
      }

      const progress: EvalRunProgress = {
        completedExamples: i + 1,
        totalExamples: examples.length,
        currentEvaluator:
          isAgentMode && i + 1 < examples.length ? "calling agent..." : nextEvaluatorName(i),
        startedAt
      };
      if (options.onProgress) {
        await options.onProgress(progress);
      }
      await cols.evalRuns.updateOne({ runId }, { $set: { progress } });
    }

    const evalRun = buildEvalRun({
      runId,
      runAt,
      datasetVersion,
      model,
      examples,
      resultDocs
    });

    const finalProgress: EvalRunProgress = {
      completedExamples: examples.length,
      totalExamples: examples.length,
      currentEvaluator: "",
      startedAt
    };

    const completedRun: EvalRun = {
      ...evalRun,
      status: "completed",
      progress: finalProgress
    };

    if (resultDocs.length > 0) {
      await cols.evalResults.insertMany(resultDocs);
    }

    const { _id: _rid, ...runUpdates } = completedRun;
    await cols.evalRuns.updateOne(
      { runId },
      {
        $set: runUpdates,
        $unset: { error: "" }
      }
    );

    return completedRun;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId) {
      try {
        const cols = await getMongoCollections();
        await cols.evalRuns.updateOne({ runId }, { $set: { status: "failed", error: msg } });
      } catch (updateErr) {
        logger.warn(
          { err: updateErr instanceof Error ? updateErr.message : String(updateErr), runId },
          "failed to persist eval run failure status"
        );
      }
    }
    throw err;
  }
}
