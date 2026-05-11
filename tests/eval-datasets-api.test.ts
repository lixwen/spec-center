import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getMongoCollections: vi.fn(),
  getAuthenticatedUserForRequest: vi.fn(),
  isPlatformAdmin: vi.fn()
}));

vi.mock("../apps/web/lib/session", () => ({
  getAuthenticatedUserForRequest: hoisted.getAuthenticatedUserForRequest,
  isPlatformAdmin: hoisted.isPlatformAdmin
}));

vi.mock("@spec-center/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@spec-center/core")>();
  return {
    ...actual,
    getMongoCollections: hoisted.getMongoCollections
  };
});

import { GET as listGET, POST as listPOST } from "../apps/web/app/api/eval/datasets/route";
import {
  GET as itemGET,
  PUT as itemPUT,
  DELETE as itemDELETE
} from "../apps/web/app/api/eval/datasets/[id]/route";

const adminUser = {
  _id: "user_admin",
  global_roles: ["platform_admin" as const],
  memberships: [],
  username: "admin",
  display_name: "Admin",
  email: "a@example.com"
};

describe("eval datasets API handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAuthenticatedUserForRequest.mockResolvedValue(adminUser as never);
    hoisted.isPlatformAdmin.mockReturnValue(true);
  });

  it("GET /api/eval/datasets returns paginated list", async () => {
    const toArray = vi.fn().mockResolvedValue([{ _id: "d1", name: "DS", category: "c1", exampleCount: 2 }]);
    hoisted.getMongoCollections.mockResolvedValue({
      evalDatasets: {
        aggregate: vi.fn().mockReturnValue({ toArray }),
        countDocuments: vi.fn().mockResolvedValue(1)
      }
    });

    const req = new Request("http://test/api/eval/datasets?page=1&limit=20");
    const res = await listGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(body.items).toHaveLength(1);
  });

  it("POST /api/eval/datasets creates a dataset when category is free", async () => {
    const insertOne = vi.fn().mockResolvedValue(undefined);
    hoisted.getMongoCollections.mockResolvedValue({
      evalDatasets: {
        findOne: vi.fn().mockResolvedValue(null),
        insertOne
      }
    });

    const req = new Request("http://test/api/eval/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My DS",
        category: "new-cat",
        description: "d",
        examples: [{ id: "e1", category: "new-cat", input: "hi" }]
      })
    });
    const res = await listPOST(req);
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.name).toBe("My DS");
    expect(doc.category).toBe("new-cat");
    expect(doc.examples).toHaveLength(1);
    expect(insertOne).toHaveBeenCalledOnce();
  });

  it("GET /api/eval/datasets/[id] returns 404 when missing", async () => {
    hoisted.getMongoCollections.mockResolvedValue({
      evalDatasets: {
        findOne: vi.fn().mockResolvedValue(null)
      }
    });
    const req = new Request("http://test/api/eval/datasets/x");
    const res = await itemGET(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("PUT /api/eval/datasets/[id] replaces document", async () => {
    const existing = {
      _id: "id1",
      name: "Old",
      category: "c",
      examples: [],
      createdAt: "t0",
      updatedAt: "t0"
    };
    const replaceOne = vi.fn().mockResolvedValue(undefined);
    hoisted.getMongoCollections.mockResolvedValue({
      evalDatasets: {
        findOne: vi.fn().mockResolvedValue(existing),
        replaceOne
      }
    });

    const req = new Request("http://test/api/eval/datasets/id1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New" })
    });
    const res = await itemPUT(req, { params: Promise.resolve({ id: "id1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("New");
    expect(replaceOne).toHaveBeenCalledOnce();
  });

  it("DELETE /api/eval/datasets/[id] returns ok when deleted", async () => {
    hoisted.getMongoCollections.mockResolvedValue({
      evalDatasets: {
        deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 })
      }
    });
    const req = new Request("http://test/api/eval/datasets/id1", { method: "DELETE" });
    const res = await itemDELETE(req, { params: Promise.resolve({ id: "id1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
