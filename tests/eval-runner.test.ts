import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  loadDataset: vi.fn(),
  computeDatasetVersion: vi.fn(() => "datasetver9"),
  mockEvaluate: vi.fn(),
  getMongoCollections: vi.fn()
}));

vi.mock("../packages/core/src/eval/dataset-loader", () => ({
  loadDataset: hoisted.loadDataset,
  computeDatasetVersion: hoisted.computeDatasetVersion
}));

vi.mock("../packages/core/src/eval/evaluators/index", () => ({
  getAllCodeEvaluators: () => [
    { name: "mock-eval", type: "code-based", evaluate: hoisted.mockEvaluate }
  ]
}));

vi.mock("../packages/core/src/data/mongo", () => ({
  getMongoCollections: hoisted.getMongoCollections
}));

vi.mock("../packages/core/src/services/rag-service", () => ({
  getChatModel: () => "aggregation-test-model"
}));

import { runEvaluation } from "../packages/core/src/eval/eval-runner";

describe("runEvaluation aggregation", () => {
  const insertOne = vi.fn().mockResolvedValue(undefined);
  const insertMany = vi.fn().mockResolvedValue(undefined);
  const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });

  beforeEach(() => {
    insertOne.mockClear();
    insertMany.mockClear();
    updateOne.mockClear();
    hoisted.loadDataset.mockResolvedValue([
      { id: "a1", category: "cat-a", input: "q1" },
      { id: "b1", category: "cat-b", input: "q2" }
    ]);
    hoisted.mockEvaluate.mockImplementation(async (_t, _s, ex) => {
      if (ex.id === "a1") {
        return { evaluator: "mock-eval", score: 1, label: "pass" as const, reason: "ok" };
      }
      return { evaluator: "mock-eval", score: 0.5, label: "partial" as const, reason: "meh" };
    });
    hoisted.getMongoCollections.mockResolvedValue({
      aiTraces: {},
      aiSpans: {},
      agentTasks: {},
      evalRuns: { insertOne, updateOne },
      evalResults: { insertMany }
    });
  });

  it("aggregates pass rate and avg score across examples", async () => {
    const run = await runEvaluation({ codeOnly: true });
    expect(run.totalExamples).toBe(2);
    expect(run.datasetVersion).toBe("datasetver9");
    expect(run.model).toBe("aggregation-test-model");
    expect(run.passRate).toBe(0.5);
    expect(run.avgScore).toBeCloseTo(0.75, 5);
    expect(run.byCategory["cat-a"].passRate).toBe(1);
    expect(run.byCategory["cat-b"].passRate).toBe(0);
    expect(run.byEvaluator["mock-eval"].avgScore).toBeCloseTo(0.75, 5);
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(insertMany).toHaveBeenCalledTimes(1);
  });
});
