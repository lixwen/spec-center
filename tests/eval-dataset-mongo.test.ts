import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getMongoCollections: vi.fn()
}));

vi.mock("../packages/core/src/data/mongo", () => ({
  getMongoCollections: hoisted.getMongoCollections
}));

import { loadDataset, loadDatasetFromFile, loadDatasetFromMongo } from "@spec-center/core";

describe("loadDatasetFromMongo", () => {
  beforeEach(() => {
    hoisted.getMongoCollections.mockReset();
  });

  it("loads all datasets when category is omitted", async () => {
    const docs = [
      {
        category: "alpha",
        examples: [
          { id: "a1", category: "alpha", input: "q1" },
          { id: "a2", category: "alpha", input: "q2" }
        ]
      },
      {
        category: "beta",
        examples: [{ id: "b1", category: "beta", input: "qb" }]
      }
    ];
    hoisted.getMongoCollections.mockResolvedValue({
      evalDatasets: {
        find: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(docs)
          })
        })
      }
    });

    const rows = await loadDatasetFromMongo();
    expect(rows).toHaveLength(3);
    expect(rows.map((e) => e.id).sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("filters by category when category is set", async () => {
    const docs = [
      {
        category: "keep",
        examples: [
          { id: "k1", category: "keep", input: "x" },
          { id: "k2", category: "keep", input: "y" }
        ]
      }
    ];
    const find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(docs)
      })
    });
    hoisted.getMongoCollections.mockResolvedValue({
      evalDatasets: { find }
    });

    const rows = await loadDatasetFromMongo("keep");
    expect(rows).toHaveLength(2);
    expect(find).toHaveBeenCalledWith({ category: "keep" });
  });

  it("loadDataset with source=mongo falls back to file when Mongo returns no examples", async () => {
    hoisted.getMongoCollections.mockResolvedValue({
      evalDatasets: {
        find: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([])
          })
        })
      }
    });

    const fromFile = loadDatasetFromFile();
    const merged = await loadDataset(undefined, "mongo");
    expect(merged.length).toBe(fromFile.length);
    expect(merged.map((e) => e.id).sort()).toEqual(fromFile.map((e) => e.id).sort());
  });
});
