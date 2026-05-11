import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: hoisted.mockCreate
        }
      };
    }
  };
});

import { llmJudgeEvaluator } from "../packages/core/src/eval/evaluators/llm-judge";
import type { AITrace, AISpan, EvalExample } from "@spec-center/core";

const emptyTrace: AITrace = {
  _id: "t1",
  traceId: "trace_test",
  conversationId: "c1",
  taskId: "task1",
  projectIds: ["p1"],
  model: "gpt-4o",
  totalDurationMs: 1,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  agentRounds: 1,
  toolCallCount: 0,
  ragChunkCount: 0,
  status: "completed",
  createdAt: new Date().toISOString()
};

const example: EvalExample = {
  id: "ej-1",
  category: "test",
  input: "Summarize the spec."
};

describe("llmJudgeEvaluator", () => {
  const prevAiKey = process.env.AI_API_KEY;
  const prevJudgeModel = process.env.EVAL_JUDGE_MODEL;

  beforeEach(() => {
    process.env.AI_API_KEY = "test-key";
    hoisted.mockCreate.mockReset();
  });

  afterEach(() => {
    if (prevAiKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = prevAiKey;
    if (prevJudgeModel === undefined) delete process.env.EVAL_JUDGE_MODEL;
    else process.env.EVAL_JUDGE_MODEL = prevJudgeModel;
  });

  it("successful evaluation: averages numeric dimensions from JSON", async () => {
    hoisted.mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"accuracy": 0.8, "helpfulness": 0.6}' } }]
    });
    const r = await llmJudgeEvaluator.evaluate(emptyTrace, [] as AISpan[], example, "Some answer.");
    expect(hoisted.mockCreate).toHaveBeenCalledTimes(1);
    expect(r.score).toBeCloseTo(0.7, 5);
    expect(r.label).toBe("partial");
  });

  it("non-JSON LLM output → score 0, fail", async () => {
    hoisted.mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not valid json at all" } }]
    });
    const r = await llmJudgeEvaluator.evaluate(emptyTrace, [] as AISpan[], example, "Some answer.");
    expect(r.score).toBe(0);
    expect(r.label).toBe("fail");
    expect(r.reason).toMatch(/unparseable/i);
  });

  it("uses EVAL_JUDGE_MODEL when set", async () => {
    process.env.EVAL_JUDGE_MODEL = "custom-judge-model";
    hoisted.mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"a": 1, "b": 1}' } }]
    });
    await llmJudgeEvaluator.evaluate(emptyTrace, [] as AISpan[], example, "out");
    expect(hoisted.mockCreate.mock.calls[0]?.[0]).toMatchObject({ model: "custom-judge-model" });
  });
});
