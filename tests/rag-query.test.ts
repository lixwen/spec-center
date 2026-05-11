import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPoints: vi.fn(),
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  embeddingsCreate: vi.fn(),
  chatCreate: vi.fn(),
  projectsFind: vi.fn()
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

import { queryRag } from "../packages/core/src/services/rag-service";

function assistantText(content: string) {
  async function* stream() {
    yield { choices: [{ delta: { content } }] };
  }
  return stream();
}

describe("RAG Query Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_API_KEY = "test-key";
    process.env.AI_EMBEDDING_MODEL = "test-model";
    process.env.AI_CHAT_MODEL = "test-chat-model";
    mocks.projectsFind.mockResolvedValue([
      { _id: "project-default", name: "Default Project" }
    ]);
  });

  it("returns answer and sources from RAG query", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });

    mocks.searchPoints.mockResolvedValue([
      {
        id: "vec-1",
        score: 0.95,
        payload: {
          project_id: "project-default",
          doc_type: "snapshot",
          doc_id: "snap-1",
          spec_id: "spec-1",
          capability: "payment-processing",
          heading_path: "Requirements > Must",
          content: "系统必须支持信用卡支付",
          chunk_index: 0
        }
      }
    ]);

    mocks.chatCreate.mockResolvedValue(
      assistantText("根据文档，系统支持信用卡。")
    );

    const result = await queryRag("支付系统支持哪些方式？", ["project-default"]);

    expect(result.answer).toBe("根据文档，系统支持信用卡。");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      type: "spec",
      title: "payment-processing",
      href: "/product-specs/spec-1",
      project_id: "project-default",
      project_name: "Default Project"
    });
  });

  it("handles empty search results gracefully", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });

    mocks.searchPoints.mockResolvedValue([]);

    mocks.chatCreate.mockResolvedValue(assistantText("未找到相关文档。"));

    const result = await queryRag("不存在的问题", ["project-default"]);

    expect(result.answer).toBe("未找到相关文档。");
    expect(result.sources).toEqual([]);
  });

  it("deduplicates sources from the same document", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });

    mocks.searchPoints.mockResolvedValue([
      {
        id: "vec-1",
        score: 0.95,
        payload: {
          project_id: "project-default",
          doc_type: "snapshot",
          doc_id: "snap-1",
          spec_id: "spec-1",
          capability: "auth",
          heading_path: "Overview",
          content: "chunk 1",
          chunk_index: 0
        }
      },
      {
        id: "vec-2",
        score: 0.90,
        payload: {
          project_id: "project-default",
          doc_type: "snapshot",
          doc_id: "snap-1",
          spec_id: "spec-1",
          capability: "auth",
          heading_path: "Requirements",
          content: "chunk 2",
          chunk_index: 1
        }
      }
    ]);

    mocks.chatCreate.mockResolvedValue(assistantText("回答"));

    const result = await queryRag("认证", ["project-default"]);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].title).toBe("auth");
  });

  it("searches across multiple projects", async () => {
    mocks.projectsFind.mockResolvedValue([
      { _id: "proj-1", name: "Render" },
      { _id: "proj-2", name: "Works" }
    ]);

    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });

    mocks.searchPoints.mockResolvedValue([
      {
        id: "vec-1",
        score: 0.95,
        payload: {
          project_id: "proj-1",
          doc_type: "snapshot",
          doc_id: "snap-1",
          spec_id: "spec-r1",
          capability: "render-api",
          heading_path: "API",
          content: "渲染接口",
          chunk_index: 0
        }
      },
      {
        id: "vec-2",
        score: 0.88,
        payload: {
          project_id: "proj-2",
          doc_type: "change",
          doc_id: "chg-1",
          heading_path: "",
          content: "Works 协作功能",
          chunk_index: 0
        }
      }
    ]);

    mocks.chatCreate.mockResolvedValue(assistantText("跨项目回答"));

    const result = await queryRag("渲染接口", ["proj-1", "proj-2"]);

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toMatchObject({
      project_id: "proj-1",
      project_name: "Render",
      type: "spec"
    });
    expect(result.sources[1]).toMatchObject({
      project_id: "proj-2",
      project_name: "Works",
      type: "change"
    });

    const searchFilter = mocks.searchPoints.mock.calls[0][2];
    expect(searchFilter.must[0].match).toEqual({ any: ["proj-1", "proj-2"] });
  });

  it("returns empty results for empty project array", async () => {
    const result = await queryRag("问题", []);

    expect(result.answer).toBe("");
    expect(result.sources).toEqual([]);
    expect(mocks.searchPoints).not.toHaveBeenCalled();
    expect(mocks.embeddingsCreate).not.toHaveBeenCalled();
  });

  it("uses single-value match for single project", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });
    mocks.searchPoints.mockResolvedValue([]);

    mocks.chatCreate.mockResolvedValue(assistantText("回答"));

    await queryRag("问题", ["project-default"]);

    const searchFilter = mocks.searchPoints.mock.calls[0][2];
    expect(searchFilter.must[0].match).toEqual({ value: "project-default" });
  });
});
