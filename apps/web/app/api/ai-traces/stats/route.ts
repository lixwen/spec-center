import { NextResponse } from "next/server";
import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest, isPlatformAdmin } from "../../../../lib/session";

function parseRange(range: string | null): { fromIso: string; toIso: string } {
  const to = new Date();
  const from = new Date(to);
  if (range === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (range === "30d") {
    from.setDate(from.getDate() - 30);
  } else {
    from.setDate(from.getDate() - 7);
  }
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPlatformAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range") ?? "7d";
  const range =
    rangeParam === "today" ? "today" : rangeParam === "30d" ? "30d" : "7d";
  const { fromIso, toIso } = parseRange(range);

  const projectId = url.searchParams.get("projectId") ?? undefined;

  const match: Record<string, unknown> = {
    createdAt: { $gte: fromIso, $lte: toIso }
  };
  if (projectId) {
    match.projectIds = projectId;
  }

  const collections = await getMongoCollections();

  const traceFacet = await collections.aiTraces
    .aggregate([
      { $match: match },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalTraces: { $sum: 1 },
                errorCount: {
                  $sum: {
                    $cond: [{ $in: ["$status", ["error", "timeout"]] }, 1, 0]
                  }
                },
                avgDurationMs: { $avg: "$totalDurationMs" },
                totalPromptTokens: { $sum: "$totalPromptTokens" },
                totalCompletionTokens: { $sum: "$totalCompletionTokens" },
                totalEstimatedCostUsd: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } }
              }
            }
          ],
          durations: [{ $sort: { totalDurationMs: 1 } }, { $group: { _id: null, values: { $push: "$totalDurationMs" } } }],
          dailyTrend: [
            {
              $group: {
                _id: { $substrBytes: ["$createdAt", 0, 10] },
                count: { $sum: 1 },
                errors: {
                  $sum: {
                    $cond: [{ $in: ["$status", ["error", "timeout"]] }, 1, 0]
                  }
                }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ])
    .toArray();

  const facet = traceFacet[0] ?? {};
  const summaryRow = facet.summary?.[0] as
    | {
        totalTraces: number;
        errorCount: number;
        avgDurationMs: number | null;
        totalPromptTokens: number;
        totalCompletionTokens: number;
        totalEstimatedCostUsd: number;
      }
    | undefined;

  const totalTraces = summaryRow?.totalTraces ?? 0;
  const errorCount = summaryRow?.errorCount ?? 0;
  const durationVals: number[] = (facet.durations?.[0] as { values?: number[] } | undefined)?.values ?? [];
  const p95Idx = durationVals.length > 0 ? Math.ceil(durationVals.length * 0.95) - 1 : -1;
  const p95DurationMs =
    p95Idx >= 0 ? durationVals[Math.min(p95Idx, durationVals.length - 1)]! : 0;

  const traceLookupMatch: Record<string, unknown> = {
    createdAt: { $gte: fromIso, $lte: toIso }
  };
  if (projectId) {
    traceLookupMatch.projectIds = projectId;
  }

  const toolAgg = await collections.aiSpans
    .aggregate([
      {
        $match: {
          type: "tool",
          startTime: { $gte: fromIso, $lte: toIso }
        }
      },
      {
        $lookup: {
          from: "ai_traces",
          localField: "traceId",
          foreignField: "traceId",
          pipeline: [{ $match: traceLookupMatch }, { $project: { _id: 1 } }],
          as: "tr"
        }
      },
      { $match: { tr: { $ne: [] } } },
      {
        $group: {
          _id: { $ifNull: ["$tool.toolName", "$name"] },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ])
    .toArray();

  const toolUsage = toolAgg.map((row) => ({
    toolName: String(row._id ?? "unknown"),
    count: row.count as number
  }));

  const dailyTrendRaw = (facet.dailyTrend ?? []) as { _id: string; count: number; errors: number }[];

  return NextResponse.json({
    totalTraces,
    errorRate: totalTraces > 0 ? errorCount / totalTraces : 0,
    avgDurationMs: summaryRow?.avgDurationMs ?? 0,
    p95DurationMs,
    totalPromptTokens: summaryRow?.totalPromptTokens ?? 0,
    totalCompletionTokens: summaryRow?.totalCompletionTokens ?? 0,
    totalEstimatedCostUsd: summaryRow?.totalEstimatedCostUsd ?? 0,
    toolUsage,
    dailyTrend: dailyTrendRaw.map((d) => ({
      day: d._id,
      count: d.count,
      errors: d.errors
    }))
  });
}
