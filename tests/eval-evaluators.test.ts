import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AITrace, AISpan, EvalExample } from "@spec-center/core";
import { costThresholdEvaluator } from "../packages/core/src/eval/evaluators/cost-threshold";
import { keywordCoverageEvaluator } from "../packages/core/src/eval/evaluators/keyword-coverage";
import { toolSelectionEvaluator } from "../packages/core/src/eval/evaluators/tool-selection";
import { trajectoryEfficiencyEvaluator } from "../packages/core/src/eval/evaluators/trajectory-efficiency";

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
  agentRounds: 2,
  toolCallCount: 1,
  ragChunkCount: 3,
  status: "completed",
  createdAt: new Date().toISOString()
};

const mockToolSpan = (toolName: string): AISpan => ({
  _id: `s_${toolName}`,
  traceId: "trace_test",
  spanId: `span_${toolName}`,
  type: "tool",
  name: "tool_call",
  startTime: new Date().toISOString(),
  durationMs: 100,
  status: "ok",
  tool: { toolName, args: {}, resultChars: 500, resultTruncated: false },
  createdAt: new Date().toISOString()
});

function ex(partial: Partial<EvalExample> & Pick<EvalExample, "id">): EvalExample {
  return {
    category: "test",
    input: "test input",
    ...partial
  };
}

describe("toolSelectionEvaluator", () => {
  it("full match: all expected tools used → score 1, pass", async () => {
    const example = ex({
      id: "e1",
      expected: { tools_used: ["get_spec_content"] }
    });
    const spans = [mockToolSpan("get_spec_content")];
    const r = await toolSelectionEvaluator.evaluate(baseTrace, spans, example, "");
    expect(r.score).toBe(1);
    expect(r.label).toBe("pass");
  });

  it("partial match: only one of two expected tools → score 0.5, partial", async () => {
    const example = ex({
      id: "e2",
      expected: { tools_used: ["get_change", "get_spec_content"] }
    });
    const spans = [mockToolSpan("get_change")];
    const r = await toolSelectionEvaluator.evaluate(baseTrace, spans, example, "");
    expect(r.score).toBe(0.5);
    expect(r.label).toBe("partial");
  });

  it("no expected tools list → score 1, pass", async () => {
    const example = ex({ id: "e3", expected: {} });
    const r = await toolSelectionEvaluator.evaluate(baseTrace, [], example, "");
    expect(r.score).toBe(1);
    expect(r.label).toBe("pass");
  });
});

describe("trajectoryEfficiencyEvaluator", () => {
  it("within bounds → score 1, pass", async () => {
    const trace = { ...baseTrace, agentRounds: 2 };
    const example = ex({ id: "e1", expected: { max_rounds: 3 } });
    const r = await trajectoryEfficiencyEvaluator.evaluate(trace, [], example, "");
    expect(r.score).toBe(1);
    expect(r.label).toBe("pass");
  });

  it("over bounds → low score, fail", async () => {
    const trace = { ...baseTrace, agentRounds: 5 };
    const example = ex({ id: "e2", expected: { max_rounds: 2 } });
    const r = await trajectoryEfficiencyEvaluator.evaluate(trace, [], example, "");
    expect(r.score).toBe(0);
    expect(r.label).toBe("fail");
  });

  it("no max_rounds expected → score 1, pass", async () => {
    const trace = { ...baseTrace, agentRounds: 99 };
    const example = ex({ id: "e3" });
    const r = await trajectoryEfficiencyEvaluator.evaluate(trace, [], example, "");
    expect(r.score).toBe(1);
    expect(r.label).toBe("pass");
  });
});

describe("costThresholdEvaluator", () => {
  const prevCost = process.env.EVAL_MAX_COST_USD;
  const prevTok = process.env.EVAL_MAX_TOKENS;

  beforeEach(() => {
    process.env.EVAL_MAX_COST_USD = "0.1";
    process.env.EVAL_MAX_TOKENS = "50000";
  });

  afterEach(() => {
    if (prevCost === undefined) delete process.env.EVAL_MAX_COST_USD;
    else process.env.EVAL_MAX_COST_USD = prevCost;
    if (prevTok === undefined) delete process.env.EVAL_MAX_TOKENS;
    else process.env.EVAL_MAX_TOKENS = prevTok;
  });

  it("under thresholds → score 1, pass", async () => {
    const trace: AITrace = {
      ...baseTrace,
      totalPromptTokens: 100,
      totalCompletionTokens: 50,
      estimatedCostUsd: 0.01
    };
    const r = await costThresholdEvaluator.evaluate(trace, [], ex({ id: "c1" }), "");
    expect(r.score).toBe(1);
    expect(r.label).toBe("pass");
  });

  it("over token threshold → score below 1", async () => {
    process.env.EVAL_MAX_TOKENS = "100";
    const trace: AITrace = {
      ...baseTrace,
      totalPromptTokens: 200,
      totalCompletionTokens: 200
    };
    const r = await costThresholdEvaluator.evaluate(trace, [], ex({ id: "c2" }), "");
    expect(r.score).toBeLessThan(1);
  });
});

describe("keywordCoverageEvaluator", () => {
  it("all keywords present → score 1, pass", async () => {
    const example = ex({
      id: "k1",
      expected: { keywords: ["alpha", "beta"] }
    });
    const r = await keywordCoverageEvaluator.evaluate(baseTrace, [], example, "ALPHA and beta here");
    expect(r.score).toBe(1);
    expect(r.label).toBe("pass");
  });

  it("should_not_contain hit → score 0, fail", async () => {
    const example = ex({
      id: "k2",
      expected: { keywords: ["ok"], should_not_contain: ["SECRET"] }
    });
    const r = await keywordCoverageEvaluator.evaluate(baseTrace, [], example, "ok but SECRET leaked");
    expect(r.score).toBe(0);
    expect(r.label).toBe("fail");
  });

  it("partial keywords → score between 0 and 1", async () => {
    const example = ex({
      id: "k3",
      expected: { keywords: ["one", "two", "three"] }
    });
    const r = await keywordCoverageEvaluator.evaluate(baseTrace, [], example, "one and two only");
    expect(r.score).toBeCloseTo(2 / 3, 5);
    expect(r.label).toBe("partial");
  });
});
