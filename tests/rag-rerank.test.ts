import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPoints: vi.fn(),
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  embeddingsCreate: vi.fn(),
  chatCreate: vi.fn(),
  projectsFind: vi.fn(),
  fetchMock: vi.fn()
}));

vi.mock("../packages/core/src/data/qdrant", () => ({
  getQdrantClient: vi.fn(),
  ensureCollection: mocks.ensureCollection,
  upsertPoints: vi.fn(),
  deleteByFilter: vi.fn(),
  searchPoints: mocks.searchPoints
}));

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      embeddings = { create: mocks.embeddingsCreate };
      chat = { completions: { create: mocks.chatCreate } };
    }
  };
});

vi.mock("../packages/core/src/data/mongo", () => ({
  getMongoCollections: vi.fn().mockResolvedValue({
    projects: {
      find: () => ({
        project: () => ({
          toArray: mocks.projectsFind
        })
      })
    }
  })
}));

vi.mock("../packages/core/src/services/center-service", () => ({
  getChange: vi.fn(),
  getSpec: vi.fn(),
  getSnapshot: vi.fn(),
  listSpecsForChange: vi.fn(),
  searchCenter: vi.fn(),
  listChanges: vi.fn(),
  listProductSpecs: vi.fn(),
  getSpecSnapshots: vi.fn()
}));

import { rerankDocuments, isRerankEnabled } from "../packages/core/src/services/rag-service";

describe("Rerank", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_API_KEY = "test-key";
    process.env.AI_BASE_URL = "https://openrouter.ai/api/v1";
    delete process.env.AI_RERANK_ENABLED;
    delete process.env.AI_RERANK_MODEL;

    vi.stubGlobal("fetch", mocks.fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  describe("isRerankEnabled", () => {
    it("returns true by default", () => {
      delete process.env.AI_RERANK_ENABLED;
      expect(isRerankEnabled()).toBe(true);
    });

    it("returns true when set to 'true'", () => {
      process.env.AI_RERANK_ENABLED = "true";
      expect(isRerankEnabled()).toBe(true);
    });

    it("returns false when set to 'false'", () => {
      process.env.AI_RERANK_ENABLED = "false";
      expect(isRerankEnabled()).toBe(false);
    });
  });

  describe("rerankDocuments", () => {
    it("calls rerank API and returns sorted results", async () => {
      mocks.fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 2, relevance_score: 0.95, document: { text: "doc3" } },
            { index: 0, relevance_score: 0.80, document: { text: "doc1" } },
            { index: 1, relevance_score: 0.60, document: { text: "doc2" } }
          ]
        })
      });

      const result = await rerankDocuments(
        "test query",
        ["doc1", "doc2", "doc3"],
        3
      );

      expect(result).toEqual([
        { index: 2, relevanceScore: 0.95 },
        { index: 0, relevanceScore: 0.80 },
        { index: 1, relevanceScore: 0.60 }
      ]);

      expect(mocks.fetchMock).toHaveBeenCalledWith(
        "https://openrouter.ai/api/v1/rerank",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": "Bearer test-key",
            "Content-Type": "application/json"
          }),
          body: expect.any(String)
        })
      );

      const body = JSON.parse(mocks.fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("cohere/rerank-4-fast");
      expect(body.query).toBe("test query");
      expect(body.documents).toEqual(["doc1", "doc2", "doc3"]);
      expect(body.top_n).toBe(3);
    });

    it("returns null when rerank is disabled", async () => {
      process.env.AI_RERANK_ENABLED = "false";

      const result = await rerankDocuments("query", ["doc1"], 1);

      expect(result).toBeNull();
      expect(mocks.fetchMock).not.toHaveBeenCalled();
    });

    it("returns null when documents array is empty", async () => {
      const result = await rerankDocuments("query", [], 5);

      expect(result).toBeNull();
      expect(mocks.fetchMock).not.toHaveBeenCalled();
    });

    it("returns null on API error (non-OK status)", async () => {
      mocks.fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error"
      });

      const result = await rerankDocuments("query", ["doc1"], 1);

      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      mocks.fetchMock.mockRejectedValue(new Error("Network error"));

      const result = await rerankDocuments("query", ["doc1"], 1);

      expect(result).toBeNull();
    });

    it("uses custom model from env", async () => {
      process.env.AI_RERANK_MODEL = "cohere/rerank-4-pro";

      mocks.fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ index: 0, relevance_score: 0.9 }]
        })
      });

      await rerankDocuments("query", ["doc1"], 1);

      const body = JSON.parse(mocks.fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe("cohere/rerank-4-pro");
    });
  });
});
