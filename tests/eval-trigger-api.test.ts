import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getMongoCollections: vi.fn(),
  getAuthenticatedUserForRequest: vi.fn(),
  isPlatformAdmin: vi.fn(),
  runEvaluation: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../apps/web/lib/session", () => ({
  getAuthenticatedUserForRequest: hoisted.getAuthenticatedUserForRequest,
  isPlatformAdmin: hoisted.isPlatformAdmin
}));

vi.mock("@spec-center/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@spec-center/core")>();
  return {
    ...actual,
    getMongoCollections: hoisted.getMongoCollections,
    runEvaluation: hoisted.runEvaluation
  };
});

import { POST } from "../apps/web/app/api/eval/trigger/route";
import { GET as progressGET } from "../apps/web/app/api/eval/runs/[runId]/progress/route";

const adminUser = {
  _id: "user_admin",
  global_roles: ["platform_admin" as const],
  memberships: [],
  username: "admin",
  display_name: "Admin",
  email: "a@example.com"
};

describe("eval trigger API handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getAuthenticatedUserForRequest.mockResolvedValue(adminUser as never);
    hoisted.isPlatformAdmin.mockReturnValue(true);
    hoisted.runEvaluation.mockClear();
    hoisted.runEvaluation.mockResolvedValue(undefined);
  });

  it("GET /api/eval/runs/[runId]/progress returns status and progress", async () => {
    hoisted.getMongoCollections.mockResolvedValue({
      evalRuns: {
        findOne: vi.fn().mockResolvedValue({
          runId: "r1",
          status: "running",
          progress: {
            completedExamples: 1,
            totalExamples: 5,
            startedAt: "2026-01-01T00:00:00.000Z"
          },
          passRate: 0.4,
          avgScore: 0.82
        })
      }
    });
    const req = new Request("http://test/api/eval/runs/r1/progress");
    const res = await progressGET(req, { params: Promise.resolve({ runId: "r1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("running");
    expect(body.progress).toMatchObject({ completedExamples: 1, totalExamples: 5 });
    expect(body.passRate).toBe(0.4);
    expect(body.avgScore).toBe(0.82);
  });

  it("POST returns runId and inserts a running stub", async () => {
    const insertOne = vi.fn().mockResolvedValue(undefined);
    hoisted.getMongoCollections.mockResolvedValue({
      evalRuns: {
        findOne: vi.fn().mockResolvedValue(null),
        insertOne
      },
      evalConfigs: {
        findOne: vi.fn().mockResolvedValue(null)
      }
    });

    const req = new Request("http://test/api/eval/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeOnly: true })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.runId).toBe("string");
    expect(body.runId.length).toBeGreaterThan(0);
    expect(insertOne).toHaveBeenCalledOnce();
    const stub = insertOne.mock.calls[0]![0];
    expect(stub.status).toBe("running");
    expect(stub.runId).toBe(body.runId);

    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(hoisted.runEvaluation).toHaveBeenCalled();
  });

  it("POST returns 409 when another run is in progress", async () => {
    hoisted.getMongoCollections.mockResolvedValue({
      evalRuns: {
        findOne: vi.fn().mockResolvedValue({ runId: "busy", status: "running" })
      },
      evalConfigs: {
        findOne: vi.fn()
      }
    });

    const req = new Request("http://test/api/eval/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already in progress/);
  });
});
