import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertPoints: vi.fn().mockResolvedValue(undefined),
  deleteByFilter: vi.fn().mockResolvedValue(undefined),
  ensureCollection: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: vi.fn().mockResolvedValue({
          data: [
            { index: 0, embedding: [0.1, 0.2, 0.3] },
            { index: 1, embedding: [0.4, 0.5, 0.6] }
          ]
        })
      };
      chat = { completions: { create: vi.fn() } };
    }
  };
});

vi.mock("../packages/core/src/data/qdrant", () => ({
  getQdrantClient: vi.fn(),
  ensureCollection: mocks.ensureCollection,
  upsertPoints: mocks.upsertPoints,
  deleteByFilter: mocks.deleteByFilter,
  searchPoints: vi.fn().mockResolvedValue([])
}));

import { splitMarkdownByHeading } from "../packages/core/src/utils/chunker";

describe("RAG Embedding Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_API_KEY = "test-key";
    process.env.AI_EMBEDDING_MODEL = "test-model";
  });

  it("chunks a markdown document and generates correct structure", () => {
    const content = `# Payment Processing
## Overview
Payment system handles all transactions.
## Requirements
### Must
- Support credit cards
- Support debit cards`;

    const chunks = splitMarkdownByHeading(content);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].heading_path).toBe("Payment Processing > Overview");
    expect(chunks[0].content).toContain("Payment system");

    const mustChunk = chunks.find((c) => c.heading_path.includes("Must"));
    expect(mustChunk).toBeDefined();
    expect(mustChunk!.content).toContain("credit cards");
  });

  it("handles empty content gracefully", () => {
    const chunks = splitMarkdownByHeading("");
    expect(chunks).toEqual([]);
  });

  it("processes single-paragraph documents as one chunk", () => {
    const content = "This is a simple paragraph with no headings.";
    const chunks = splitMarkdownByHeading(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading_path).toBe("");
    expect(chunks[0].content).toBe(content);
  });

  it("assigns sequential chunk indices", () => {
    const content = `## A
content-a
## B
content-b
## C
content-c`;

    const chunks = splitMarkdownByHeading(content);
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1, 2]);
  });
});
