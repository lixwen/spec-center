import { describe, it, expect, vi, beforeEach } from "vitest";

const centerMocks = vi.hoisted(() => ({
  getChange: vi.fn(),
  getSpec: vi.fn(),
  getSnapshot: vi.fn(),
  listSpecsForChange: vi.fn(),
  searchCenter: vi.fn(),
  getSpecIssues: vi.fn(),
  getCrossSpecIssues: vi.fn(),
  getReviewBrief: vi.fn(),
  getComments: vi.fn(),
  getCurrentReviewSessionForChange: vi.fn(),
  getBaselineContext: vi.fn(),
  getOverviewMetrics: vi.fn(),
  getChangeDashboardSummary: vi.fn()
}));

vi.mock("../packages/core/src/data/qdrant", () => ({
  getQdrantClient: vi.fn(),
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  upsertPoints: vi.fn(),
  deleteByFilter: vi.fn(),
  searchPoints: vi.fn().mockResolvedValue([])
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    embeddings = { create: vi.fn() };
    chat = { completions: { create: vi.fn() } };
  }
}));

vi.mock("../packages/core/src/data/mongo", () => ({
  getMongoCollections: vi.fn().mockResolvedValue({
    projects: { find: () => ({ project: () => ({ toArray: vi.fn().mockResolvedValue([]) }) }) }
  })
}));

vi.mock("../packages/core/src/services/center-service", () => ({
  ...centerMocks
}));

import {
  truncateToTokenLimit,
  buildAgentTools,
  createDetectSpecIssuesTool,
  createDetectCrossSpecIssuesTool,
  createGetReviewBriefTool,
  createGetReviewCommentsTool,
  createGetBaselineContextTool,
  createGetProjectOverviewTool
} from "../packages/core/src/services/agent-service";

const PROJECT_ID = "proj-001";
const PROJECT_IDS = [PROJECT_ID];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("truncateToTokenLimit", () => {
  it("returns short text within limit as-is", () => {
    const text = "Hello, world.";
    expect(truncateToTokenLimit(text, 100)).toBe(text);
  });

  it("truncates long ASCII text with suffix", () => {
    const long = "a".repeat(200);
    const out = truncateToTokenLimit(long, 10);
    expect(out).toContain("[内容已截取");
    expect(out.startsWith("a".repeat(40))).toBe(true);
  });

  it("returns empty string as-is", () => {
    expect(truncateToTokenLimit("", 100)).toBe("");
  });
});

describe("buildAgentTools", () => {
  it("returns 10 tools", () => {
    const tools = buildAgentTools();
    expect(tools).toHaveLength(10);
  });

  it("does not contain list_change_specs", () => {
    const tools = buildAgentTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("list_change_specs");
  });

  it("contains all expected tool names", () => {
    const tools = buildAgentTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "get_change",
      "get_spec_content",
      "search_specs",
      "vector_search",
      "detect_spec_issues",
      "detect_cross_spec_issues",
      "get_review_brief",
      "get_review_comments",
      "get_baseline_context",
      "get_project_overview"
    ]);
  });
});

describe("createDetectSpecIssuesTool", () => {
  const tool = createDetectSpecIssuesTool();

  it("returns issues for valid spec", async () => {
    centerMocks.getSpec.mockResolvedValue({ _id: "s1", project_id: PROJECT_ID, capability: "auth" });
    centerMocks.getSpecIssues.mockResolvedValue([
      { kind: "Missing", severity: "high", title: "Timeout path not specified", message: "..." }
    ]);

    const result = JSON.parse(await tool.execute({ spec_id: "s1" }, PROJECT_IDS));
    expect(result.spec_id).toBe("s1");
    expect(result.capability).toBe("auth");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].kind).toBe("Missing");
  });

  it("returns error when spec not found", async () => {
    centerMocks.getSpec.mockResolvedValue(null);
    const result = JSON.parse(await tool.execute({ spec_id: "bad" }, PROJECT_IDS));
    expect(result.error).toContain("未找到该 Spec");
  });

  it("returns error when project mismatch", async () => {
    centerMocks.getSpec.mockResolvedValue({ _id: "s1", project_id: "other-proj" });
    const result = JSON.parse(await tool.execute({ spec_id: "s1" }, PROJECT_IDS));
    expect(result.error).toContain("项目不匹配");
  });
});

describe("createDetectCrossSpecIssuesTool", () => {
  const tool = createDetectCrossSpecIssuesTool();

  it("returns issues for valid change", async () => {
    centerMocks.getChange.mockResolvedValue({ _id: "c1", project_id: PROJECT_ID });
    centerMocks.getCrossSpecIssues.mockResolvedValue([
      { kind: "Inconsistency", severity: "medium", title: "Shared flow", message: "..." }
    ]);

    const result = JSON.parse(await tool.execute({ change_id: "c1" }, PROJECT_IDS));
    expect(result.change_id).toBe("c1");
    expect(result.issues).toHaveLength(1);
  });

  it("returns empty issues for single-spec change", async () => {
    centerMocks.getChange.mockResolvedValue({ _id: "c1", project_id: PROJECT_ID });
    centerMocks.getCrossSpecIssues.mockResolvedValue([]);

    const result = JSON.parse(await tool.execute({ change_id: "c1" }, PROJECT_IDS));
    expect(result.issues).toHaveLength(0);
  });

  it("returns error when change not found", async () => {
    centerMocks.getChange.mockResolvedValue(null);
    const result = JSON.parse(await tool.execute({ change_id: "bad" }, PROJECT_IDS));
    expect(result.error).toContain("未找到该 Change");
  });
});

describe("createGetReviewBriefTool", () => {
  const tool = createGetReviewBriefTool();

  it("returns brief for valid spec", async () => {
    centerMocks.getSpec.mockResolvedValue({ _id: "s1", project_id: PROJECT_ID, capability: "auth" });
    centerMocks.getReviewBrief.mockResolvedValue({
      label: "Advisory",
      overview: "auth is under review",
      scope: ["Owner role: dev"],
      keyChanges: ["first line"],
      reviewerFocus: ["Check scenarios"],
      risks: ["Regression risk"]
    });

    const result = JSON.parse(await tool.execute({ spec_id: "s1" }, PROJECT_IDS));
    expect(result.brief.label).toBe("Advisory");
    expect(result.capability).toBe("auth");
  });

  it("returns error when spec not found", async () => {
    centerMocks.getSpec.mockResolvedValue(null);
    const result = JSON.parse(await tool.execute({ spec_id: "bad" }, PROJECT_IDS));
    expect(result.error).toContain("未找到该 Spec");
  });

  it("returns error when getReviewBrief throws", async () => {
    centerMocks.getSpec.mockResolvedValue({ _id: "s1", project_id: PROJECT_ID });
    centerMocks.getReviewBrief.mockRejectedValue(new Error("Working snapshot missing."));

    const result = JSON.parse(await tool.execute({ spec_id: "s1" }, PROJECT_IDS));
    expect(result.error).toContain("Working snapshot missing");
  });
});

describe("createGetReviewCommentsTool", () => {
  const tool = createGetReviewCommentsTool();

  it("returns comments when session exists", async () => {
    centerMocks.getChange.mockResolvedValue({ _id: "c1", project_id: PROJECT_ID });
    centerMocks.getCurrentReviewSessionForChange.mockResolvedValue({
      _id: "rs1",
      baselines: [{ spec_id: "s1" }, { spec_id: "s2" }]
    });
    centerMocks.getComments
      .mockResolvedValueOnce([{ spec_id: "s1", author: "alice", content: "looks good", status: "open", created_at: "2026-04-30" }])
      .mockResolvedValueOnce([]);

    const result = JSON.parse(await tool.execute({ change_id: "c1" }, PROJECT_IDS));
    expect(result.session_id).toBe("rs1");
    expect(result.total).toBe(1);
    expect(result.comments[0].author).toBe("alice");
  });

  it("returns message when no active session", async () => {
    centerMocks.getChange.mockResolvedValue({ _id: "c1", project_id: PROJECT_ID });
    centerMocks.getCurrentReviewSessionForChange.mockResolvedValue(null);

    const result = JSON.parse(await tool.execute({ change_id: "c1" }, PROJECT_IDS));
    expect(result.message).toContain("无活跃评审会话");
  });

  it("filters by spec_id when provided", async () => {
    centerMocks.getChange.mockResolvedValue({ _id: "c1", project_id: PROJECT_ID });
    centerMocks.getCurrentReviewSessionForChange.mockResolvedValue({
      _id: "rs1",
      baselines: [{ spec_id: "s1" }]
    });
    centerMocks.getComments.mockResolvedValue([
      { spec_id: "s1", author: "bob", content: "fix this", status: "open", created_at: "2026-04-30" }
    ]);

    const result = JSON.parse(await tool.execute({ change_id: "c1", spec_id: "s1" }, PROJECT_IDS));
    expect(result.spec_id).toBe("s1");
    expect(result.comments).toHaveLength(1);
    expect(centerMocks.getComments).toHaveBeenCalledWith("rs1", "s1");
  });
});

describe("createGetBaselineContextTool", () => {
  const tool = createGetBaselineContextTool();

  it("returns baseline context", async () => {
    centerMocks.getChange.mockResolvedValue({ _id: "c1", project_id: PROJECT_ID });
    centerMocks.getCurrentReviewSessionForChange.mockResolvedValue({ _id: "rs1" });
    centerMocks.getBaselineContext.mockResolvedValue({
      delta: { content: "delta content here" },
      productBaseline: { content: "baseline content here" },
      spec: { capability: "auth" }
    });

    const result = JSON.parse(await tool.execute({ change_id: "c1", spec_id: "s1" }, PROJECT_IDS));
    expect(result.spec_capability).toBe("auth");
    expect(result.delta_content).toContain("delta content");
    expect(result.product_baseline_content).toContain("baseline content");
  });

  it("returns error when no active session", async () => {
    centerMocks.getChange.mockResolvedValue({ _id: "c1", project_id: PROJECT_ID });
    centerMocks.getCurrentReviewSessionForChange.mockResolvedValue(null);

    const result = JSON.parse(await tool.execute({ change_id: "c1", spec_id: "s1" }, PROJECT_IDS));
    expect(result.error).toContain("无活跃评审会话");
  });

  it("returns error when change not found", async () => {
    centerMocks.getChange.mockResolvedValue(null);
    const result = JSON.parse(await tool.execute({ change_id: "bad", spec_id: "s1" }, PROJECT_IDS));
    expect(result.error).toContain("未找到该 Change");
  });
});

describe("createGetProjectOverviewTool", () => {
  const tool = createGetProjectOverviewTool();

  it("returns merged metrics and dashboard", async () => {
    centerMocks.getOverviewMetrics.mockResolvedValue({
      totalChanges: 10,
      reviewQueue: 2,
      productSpecs: 5,
      openComments: 3,
      readyToArchive: 1
    });
    centerMocks.getChangeDashboardSummary.mockResolvedValue({
      draft: 3, ready: 2, in_review: 2, approved: 1, archived: 2
    });

    const result = JSON.parse(await tool.execute({}, PROJECT_IDS));
    expect(result.metrics.totalChanges).toBe(10);
    expect(result.dashboard.in_review).toBe(2);
  });

  it("returns error when project mismatch", async () => {
    const result = JSON.parse(await tool.execute({ project_id: "other-proj" }, PROJECT_IDS));
    expect(result.error).toContain("无权访问该项目");
  });

  it("uses default project when none specified", async () => {
    centerMocks.getOverviewMetrics.mockResolvedValue({ totalChanges: 5 });
    centerMocks.getChangeDashboardSummary.mockResolvedValue({ draft: 1 });

    await tool.execute({}, PROJECT_IDS);
    expect(centerMocks.getOverviewMetrics).toHaveBeenCalledWith(PROJECT_ID);
    expect(centerMocks.getChangeDashboardSummary).toHaveBeenCalledWith(PROJECT_ID);
  });
});
