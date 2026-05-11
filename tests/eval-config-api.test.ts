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

import { GET, PUT } from "../apps/web/app/api/eval/config/route";

const adminUser = {
  _id: "user_admin",
  global_roles: ["platform_admin" as const],
  memberships: [],
  username: "admin",
  display_name: "Admin",
  email: "a@example.com"
};

describe("eval config API handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAuthenticatedUserForRequest.mockResolvedValue(adminUser as never);
    hoisted.isPlatformAdmin.mockReturnValue(true);
  });

  it("GET returns built-in default when no document exists", async () => {
    hoisted.getMongoCollections.mockResolvedValue({
      evalConfigs: {
        findOne: vi.fn().mockResolvedValue(null)
      }
    });

    const res = await GET(new Request("http://test/api/eval/config"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultPassThreshold).toBe(0.7);
    expect(body.evaluators.map((e: { name: string }) => e.name)).toEqual([
      "tool-selection",
      "trajectory-efficiency",
      "cost-threshold",
      "keyword-coverage",
      "llm-judge"
    ]);
    expect(body.evaluators.every((e: { enabled: boolean }) => e.enabled)).toBe(true);
  });

  it("PUT validates and upserts config", async () => {
    const replaceOne = vi.fn().mockResolvedValue(undefined);
    hoisted.getMongoCollections.mockResolvedValue({
      evalConfigs: {
        findOne: vi.fn().mockResolvedValue(null),
        replaceOne
      }
    });

    const payload = {
      evaluators: [
        { name: "cost-threshold", enabled: true, params: { maxCostUsd: 0.05, maxTokens: 10000 } },
        { name: "llm-judge", enabled: false }
      ],
      defaultPassThreshold: 0.8
    };
    const req = new Request("http://test/api/eval/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultPassThreshold).toBe(0.8);
    expect(body.evaluators).toHaveLength(2);
    expect(replaceOne).toHaveBeenCalledOnce();
  });
});
