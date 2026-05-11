import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  searchPoints: vi.fn(),
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  embeddingsCreate: vi.fn(),
  chatCreate: vi.fn(),
  projectsFind: vi.fn()
}));

const centerMocks = vi.hoisted(() => ({
  getChange: vi.fn(),
  getSpec: vi.fn(),
  getSnapshot: vi.fn(),
  listSpecsForChange: vi.fn(),
  searchCenter: vi.fn(),
  listChanges: vi.fn(),
  listProductSpecs: vi.fn(),
  getSpecSnapshots: vi.fn()
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
  getChange: centerMocks.getChange,
  getSpec: centerMocks.getSpec,
  getSnapshot: centerMocks.getSnapshot,
  listSpecsForChange: centerMocks.listSpecsForChange,
  searchCenter: centerMocks.searchCenter,
  listChanges: centerMocks.listChanges,
  listProductSpecs: centerMocks.listProductSpecs,
  getSpecSnapshots: centerMocks.getSpecSnapshots
}));

import { queryRagStream } from "../packages/core/src/services/rag-service";

async function collectStream(
  query: string,
  projectIds: string[]
): Promise<Array<{ type: string; content?: string; name?: string; summary?: string }>> {
  const out: Array<{ type: string; content?: string; name?: string; summary?: string }> = [];
  for await (const ev of queryRagStream(query, projectIds)) {
    out.push(ev);
  }
  return out;
}

const changeFixture = {
  _id: "chg_1",
  project_id: "proj_1",
  title: "Test",
  description: "Test desc",
  status: "draft",
  sprint: null,
  prd_link: null,
  review_required: true,
  created_by: "user_1",
  created_at: "2026-01-01",
  updated_at: "2026-01-01"
};

const specsFixture = [
  {
    _id: "spec_1",
    project_id: "proj_1",
    capability: "frontend-api",
    owner_role: "frontend",
    sync_status: "synced",
    working_snapshot_id: "snap_1"
  }
];

function assistantMessage(
  content: string | null,
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>
) {
  const chunks: Array<{ choices: Array<{ delta: Record<string, unknown> }> }> = [];

  if (toolCalls && toolCalls.length > 0) {
    for (const tc of toolCalls) {
      chunks.push({
        choices: [{
          delta: {
            tool_calls: [{
              index: toolCalls.indexOf(tc),
              id: tc.id,
              function: { name: tc.function.name, arguments: tc.function.arguments }
            }]
          }
        }]
      });
    }
  }

  if (content) {
    chunks.push({ choices: [{ delta: { content } }] });
  }

  async function* stream() {
    for (const chunk of chunks) {
      yield chunk;
    }
  }
  return stream();
}

describe("Agent loop (queryRagStream)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_API_KEY = "test-key";
    process.env.AI_EMBEDDING_MODEL = "test-model";
    process.env.AI_CHAT_MODEL = "test-chat-model";
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    });
    mocks.searchPoints.mockResolvedValue([]);
    mocks.projectsFind.mockResolvedValue([{ _id: "proj_1", name: "Project One" }]);
  });

  it("simple question yields only token and sources events", async () => {
    mocks.chatCreate.mockResolvedValue(
      assistantMessage("Direct answer without tools.")
    );

    const events = await collectStream("What is Spec Center?", ["proj_1"]);
    const types = events.map((e) => e.type);

    expect(types.filter((t) => t === "thinking")).toHaveLength(0);
    expect(types.filter((t) => t === "tool_call")).toHaveLength(0);
    expect(types.filter((t) => t === "tool_result")).toHaveLength(0);
    expect(types.filter((t) => t === "token").length).toBeGreaterThan(0);
    expect(types[types.length - 1]).toBe("sources");

    const answer = events
      .filter((e) => e.type === "token")
      .map((e) => e.content ?? "")
      .join("");
    expect(answer).toBe("Direct answer without tools.");
  });

  it("tool use then text yields thinking, tool_call, tool_result, token, sources", async () => {
    centerMocks.getChange.mockResolvedValue(changeFixture);
    centerMocks.listSpecsForChange.mockResolvedValue(specsFixture);

    mocks.chatCreate
      .mockResolvedValueOnce(
        assistantMessage(null, [
          {
            id: "call_123",
            type: "function",
            function: {
              name: "get_change",
              arguments: '{"change_id":"chg_1"}'
            }
          }
        ])
      )
      .mockResolvedValueOnce(assistantMessage("After tool: done."));

    const events = await collectStream("Analyze change chg_1", ["proj_1"]);
    const types = events.map((e) => e.type);

    expect(events[0]?.type).toBe("context_usage");
    expect(events[1]?.type).toBe("thinking");
    expect(events[2]?.type).toBe("tool_call");
    expect(events[3]?.type).toBe("tool_result");
    expect(events[events.length - 1]?.type).toBe("sources");
    expect(types.slice(4, -1).every((t) => t === "token")).toBe(true);

    expect(events[2]).toMatchObject({ type: "tool_call", name: "get_change" });
    expect(events[3].type).toBe("tool_result");
    expect(events[3].name).toBe("get_change");

    const answer = events
      .filter((e) => e.type === "token")
      .map((e) => e.content ?? "")
      .join("");
    expect(answer).toBe("After tool: done.");

    expect(mocks.chatCreate).toHaveBeenCalledTimes(2);
  });

  it("stops after max rounds when model always requests tools", async () => {
    let invocations = 0;
    mocks.chatCreate.mockImplementation(async () => {
      invocations += 1;
      return assistantMessage(null, [
        {
          id: `call_loop_${invocations}`,
          type: "function",
          function: {
            name: "get_change",
            arguments: '{"change_id":"chg_1"}'
          }
        }
      ]);
    });

    centerMocks.getChange.mockResolvedValue(changeFixture);
    centerMocks.listSpecsForChange.mockResolvedValue(specsFixture);

    const events = await collectStream("Never ending tools", ["proj_1"]);

    expect(invocations).toBe(20);
    expect(mocks.chatCreate).toHaveBeenCalledTimes(20);

    const tokenText = events
      .filter((e) => e.type === "token")
      .map((e) => e.content ?? "")
      .join("");
    expect(tokenText).toContain("已达到工具调用轮次上限");

    expect(events[events.length - 1].type).toBe("sources");
  });
});
