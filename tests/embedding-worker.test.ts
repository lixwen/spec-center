import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: vi.fn().mockResolvedValue({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
        })
      };
      chat = { completions: { create: vi.fn() } };
    }
  };
});

vi.mock("../packages/core/src/data/qdrant", () => ({
  getQdrantClient: vi.fn(),
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  upsertPoints: vi.fn().mockResolvedValue(undefined),
  deleteByFilter: vi.fn().mockResolvedValue(undefined),
  searchPoints: vi.fn().mockResolvedValue([])
}));

import {
  getMongoCollections,
  ensureMongoBootstrap,
  clearMongoDatabase,
  closeMongoConnection
} from "../packages/core/src/data/mongo";
import { nowIso } from "../packages/core/src/utils/hash";
import { createId } from "../packages/core/src/utils/id";
import { pollAndProcess } from "../packages/core/src/services/embedding-worker";

describe("Embedding Worker", () => {
  beforeEach(async () => {
    process.env.AI_API_KEY = "test-key";
    await ensureMongoBootstrap();
    await clearMongoDatabase();
    await ensureMongoBootstrap();
  });

  afterEach(async () => {
    await closeMongoConnection();
  });

  it("processes a pending task and marks it done", async () => {
    const collections = await getMongoCollections();
    const timestamp = nowIso();
    const taskId = createId("embtask");

    await collections.changes.insertOne({
      _id: "CHG-2026-00001",
      project_id: "project-default",
      title: "Test Change",
      description: "Test description content",
      status: "draft",
      prd_link: null,
      repo_changes: [],
      current_review_session_id: null,
      review_required: true,
      sprint: null,
      created_by: "admin",
      version: 1,
      created_at: timestamp,
      updated_at: timestamp
    });

    await collections.embeddingTasks.insertOne({
      _id: taskId,
      doc_type: "change",
      doc_id: "CHG-2026-00001",
      project_id: "project-default",
      status: "pending",
      retry_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    });

    const processed = await pollAndProcess();
    expect(processed).toBe(true);

    const task = await collections.embeddingTasks.findOne({ _id: taskId });
    expect(task?.status).toBe("done");
  });

  it("returns false when no pending tasks exist", async () => {
    const processed = await pollAndProcess();
    expect(processed).toBe(false);
  });

  it("handles non-existent document gracefully", async () => {
    const collections = await getMongoCollections();
    const timestamp = nowIso();
    const taskId = createId("embtask");

    await collections.embeddingTasks.insertOne({
      _id: taskId,
      doc_type: "snapshot",
      doc_id: "non-existent-snap",
      project_id: "project-default",
      status: "pending",
      retry_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    });

    const processed = await pollAndProcess();
    expect(processed).toBe(true);

    const task = await collections.embeddingTasks.findOne({ _id: taskId });
    expect(task?.status).toBe("done");
  });

  it("does not pick up tasks that have exceeded max retries", async () => {
    const collections = await getMongoCollections();
    const timestamp = nowIso();
    const taskId = createId("embtask");

    await collections.embeddingTasks.insertOne({
      _id: taskId,
      doc_type: "change",
      doc_id: "CHG-2026-00001",
      project_id: "project-default",
      status: "pending",
      retry_count: 5,
      created_at: timestamp,
      updated_at: timestamp
    });

    const processed = await pollAndProcess();
    expect(processed).toBe(false);

    const task = await collections.embeddingTasks.findOne({ _id: taskId });
    expect(task?.status).toBe("pending");
  });
});
