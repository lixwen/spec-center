import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AITrace, EvalExample } from "@spec-center/core";
import { costThresholdEvaluator, trajectoryEfficiencyEvaluator } from "@spec-center/core";

const baseTrace: AITrace = {
  _id: "t1",
  traceId: "trace_test",
  conversationId: "c1",
  taskId: "task1",
  projectIds: ["p1"],
  model: "gpt-4o",
  totalDurationMs: 5000,
  totalPromptTokens: 1000,
  totalCompletionTokens: 500,
  agentRounds: 3,
  toolCallCount: 1,
  ragChunkCount: 3,
  status: "completed",
  createdAt: new Date().toISOString()
};

function ex(partial: Partial<EvalExample> & Pick<EvalExample, "id">): EvalExample {
  return {
    category: "test",
    input: "test input",
    ...partial
  };
}

describe("evaluator params: cost-threshold", () => {
  const prevCost = process.env.EVAL_MAX_COST_USD;
  const prevTok = process.env.EVAL_MAX_TOKENS;

  beforeEach(() => {
    process.env.EVAL_MAX_COST_USD = "999";
    process.env.EVAL_MAX_TOKENS = "999999";
  });

  afterEach(() => {
    if (prevCost === undefined) delete process.env.EVAL_MAX_COST_USD;
    else process.env.EVAL_MAX_COST_USD = prevCost;
    if (prevTok === undefined) delete process.env.EVAL_MAX_TOKENS;
    else process.env.EVAL_MAX_TOKENS = prevTok;
  });

  it("uses custom maxCostUsd and maxTokens from params", async () => {
    const traceCostOnly: AITrace = {
      ...baseTrace,
      totalPromptTokens: 5,
      totalCompletionTokens: 5,
      estimatedCostUsd: 0.02
    };
    const r = await costThresholdEvaluator.evaluate(traceCostOnly, [], ex({ id: "p1" }), "", {
      maxCostUsd: 0.01,
      maxTokens: 10_000
    });
    expect(r.score).toBe(0.5);
    expect(r.details).toMatchObject({
      maxCostUsd: 0.01,
      maxTokens: 10_000,
      costExceeded: true,
      tokensExceeded: false
    });

    const traceTokOnly: AITrace = {
      ...baseTrace,
      totalPromptTokens: 80,
      totalCompletionTokens: 40,
      estimatedCostUsd: 0.001
    };
    const rTok = await costThresholdEvaluator.evaluate(traceTokOnly, [], ex({ id: "p2" }), "", {
      maxCostUsd: 1,
      maxTokens: 100
    });
    expect(rTok.details).toMatchObject({
      costExceeded: false,
      tokensExceeded: true
    });
  });

  it("uses defaults when params are omitted (env / built-in fallbacks)", async () => {
    process.env.EVAL_MAX_COST_USD = "0.1";
    process.env.EVAL_MAX_TOKENS = "50000";
    const trace: AITrace = {
      ...baseTrace,
      totalPromptTokens: 10,
      totalCompletionTokens: 10,
      estimatedCostUsd: 0.05
    };
    const r = await costThresholdEvaluator.evaluate(trace, [], ex({ id: "d1" }), "");
    expect(r.score).toBe(1);
    expect(r.details).toMatchObject({
      maxCostUsd: 0.1,
      maxTokens: 50000
    });
  });
});

describe("evaluator params: trajectory-efficiency", () => {
  it("uses custom roundMultiplier from params", async () => {
    const trace = { ...baseTrace, agentRounds: 3 };
    const example = ex({ id: "t1", expected: { max_rounds: 2 } });
    const strict = await trajectoryEfficiencyEvaluator.evaluate(trace, [], example, "", {
      roundMultiplier: 1
    });
    expect(strict.score).toBeCloseTo(0.5, 5);

    const loose = await trajectoryEfficiencyEvaluator.evaluate(trace, [], example, "", {
      roundMultiplier: 2
    });
    expect(loose.score).toBe(1);
  });

  it("defaults roundMultiplier to 1 when params are omitted", async () => {
    const trace = { ...baseTrace, agentRounds: 3 };
    const example = ex({ id: "t2", expected: { max_rounds: 2 } });
    const r = await trajectoryEfficiencyEvaluator.evaluate(trace, [], example, "");
    expect(r.details).toMatchObject({ roundMultiplier: 1, effectiveMaxRounds: 2 });
    expect(r.score).toBeCloseTo(0.5, 5);
  });
});
