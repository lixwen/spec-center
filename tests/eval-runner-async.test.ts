import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  loadDataset: vi.fn(),
  computeDatasetVersion: vi.fn(() => "datasetver-async"),
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
  getChatModel: () => "async-test-model"
}));

import { runEvaluation } from "@spec-center/core";

describe("runEvaluation async progress and status", () => {
  const insertOne = vi.fn().mockResolvedValue(undefined);
  const insertMany = vi.fn().mockResolvedValue(undefined);
  const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });

  beforeEach(() => {
    insertOne.mockClear();
    insertMany.mockClear();
    updateOne.mockClear();
    hoisted.loadDataset.mockResolvedValue([
      { id: "x1", category: "c1", input: "q1" },
      { id: "x2", category: "c1", input: "q2" },
      { id: "x3", category: "c1", input: "q3" }
    ]);
    hoisted.mockEvaluate.mockResolvedValue({
      evaluator: "mock-eval",
      score: 1,
      label: "pass" as const,
      reason: "ok"
    });
    hoisted.getMongoCollections.mockResolvedValue({
      aiTraces: {},
      aiSpans: {},
      agentTasks: {},
      evalRuns: { insertOne, updateOne },
      evalResults: { insertMany }
    });
  });

  it("calls onProgress once per example with increasing completedExamples", async () => {
    const onProgress = vi.fn().mockResolvedValue(undefined);
    await runEvaluation({ codeOnly: true, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0]![0]).toMatchObject({
      completedExamples: 1,
      totalExamples: 3
    });
    expect(onProgress.mock.calls[1]![0]).toMatchObject({ completedExamples: 2 });
    expect(onProgress.mock.calls[2]![0]).toMatchObject({ completedExamples: 3 });
  });

  it("updates eval run status from running to completed", async () => {
    await runEvaluation({ codeOnly: true });

    expect(insertOne.mock.calls[0]![0]).toMatchObject({ status: "running" });

    const setOps = updateOne.mock.calls.map((c) => c[1]?.$set ?? {});
    const hasCompleted = setOps.some((s) => s.status === "completed");
    expect(hasCompleted).toBe(true);

    const finalSet = setOps.filter((s) => s.status === "completed").at(-1);
    expect(finalSet?.progress).toMatchObject({
      completedExamples: 3,
      totalExamples: 3,
      currentEvaluator: ""
    });
  });

  it("sets status to failed when loadDataset throws (preset runId)", async () => {
    hoisted.loadDataset.mockRejectedValue(new Error("dataset boom"));

    await expect(
      runEvaluation({ codeOnly: true, runId: "existing-run" })
    ).rejects.toThrow("dataset boom");

    const failedSet = updateOne.mock.calls.find((c) => c[1]?.$set?.status === "failed");
    expect(failedSet).toBeDefined();
    expect(failedSet![1].$set.error).toContain("dataset boom");
  });
});
