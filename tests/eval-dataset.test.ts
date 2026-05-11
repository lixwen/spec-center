import { describe, it, expect } from "vitest";
import { loadDataset } from "../packages/core/src/eval/dataset-loader";

describe("loadDataset", () => {
  it("loads all datasets as a non-empty array", async () => {
    const all = await loadDataset();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  it("loads by category (file) and returns only examples for that category", async () => {
    const specQuery = await loadDataset("spec-query");
    expect(specQuery.length).toBeGreaterThan(0);
    for (const ex of specQuery) {
      expect(ex.category).toBe("spec-query");
    }
  });

  it("each loaded example has required fields id, category, input", async () => {
    const all = await loadDataset();
    for (const ex of all) {
      expect(typeof ex.id).toBe("string");
      expect(ex.id.length).toBeGreaterThan(0);
      expect(typeof ex.category).toBe("string");
      expect(ex.category.length).toBeGreaterThan(0);
      expect(typeof ex.input).toBe("string");
      expect(ex.input.length).toBeGreaterThan(0);
    }
  });

  it("throws when dataset file for category is missing", async () => {
    await expect(loadDataset("non-existent-category-xyz")).rejects.toThrow(/Dataset file not found/);
  });
});
