import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPoints: vi.fn(),
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  embeddingsCreate: vi.fn(),
  chatCreate: vi.fn()
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
          toArray: () => Promise.resolve([])
        })
      })
    }
  })
}));

import { queryRag } from "../packages/core/src/services/rag-service";

describe("RAG Conversation History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_API_KEY = "test-key";
    process.env.AI_EMBEDDING_MODEL = "test-model";
    process.env.AI_CHAT_MODEL = "test-chat-model";
  });

  it("passes history messages to chat completion", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });
    mocks.searchPoints.mockResolvedValue([]);

    async function* mockStream() {
      yield { choices: [{ delta: { content: "回答" } }] };
    }
    mocks.chatCreate.mockResolvedValue(mockStream());

    const history = [
      { role: "user" as const, content: "什么是认证？" },
      { role: "assistant" as const, content: "认证是验证身份的过程。" }
    ];

    await queryRag("那授权呢？", ["project-default"], history);

    expect(mocks.chatCreate).toHaveBeenCalledTimes(1);
    const callArgs = mocks.chatCreate.mock.calls[0][0];
    const messages = callArgs.messages;

    expect(messages[0].role).toBe("system");
    expect(messages[1]).toEqual({ role: "user", content: "什么是认证？" });
    expect(messages[2]).toEqual({ role: "assistant", content: "认证是验证身份的过程。" });
    expect(messages[3].role).toBe("user");
    expect(messages[3].content).toContain("那授权呢？");
  });

  it("works without history (backward compatible)", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });
    mocks.searchPoints.mockResolvedValue([]);

    async function* mockStream() {
      yield { choices: [{ delta: { content: "回答" } }] };
    }
    mocks.chatCreate.mockResolvedValue(mockStream());

    await queryRag("问题", ["project-default"]);

    const callArgs = mocks.chatCreate.mock.calls[0][0];
    const messages = callArgs.messages;

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
  });

  it("keeps all short history messages when within token budget", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });
    mocks.searchPoints.mockResolvedValue([]);

    async function* mockStream() {
      yield { choices: [{ delta: { content: "回答" } }] };
    }
    mocks.chatCreate.mockResolvedValue(mockStream());

    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `消息 ${i}`
    }));

    await queryRag("最新问题", ["project-default"], history);

    const callArgs = mocks.chatCreate.mock.calls[0][0];
    const messages = callArgs.messages;

    // With default 128k window, all 30 short messages fit within budget
    // system + 30 history + 1 current query = 32
    expect(messages).toHaveLength(32);
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toBe("消息 0");
    expect(messages[30].content).toBe("消息 29");
  });

  it("trims history when token budget is constrained", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });
    mocks.searchPoints.mockResolvedValue([]);

    async function* mockStream() {
      yield { choices: [{ delta: { content: "回答" } }] };
    }
    mocks.chatCreate.mockResolvedValue(mockStream());

    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `消息 ${i} ${"x".repeat(200)}`
    }));

    process.env.CONTEXT_WINDOW_TOKENS = "800";
    try {
      await queryRag("最新问题", ["project-default"], history);

      const callArgs = mocks.chatCreate.mock.calls[0][0];
      const messages = callArgs.messages;

      expect(messages.length).toBeLessThan(32);
      expect(messages[0].role).toBe("system");
      expect(messages[messages.length - 1].role).toBe("user");
      expect(messages[messages.length - 1].content).toContain("最新问题");
    } finally {
      delete process.env.CONTEXT_WINDOW_TOKENS;
    }
  });
});
