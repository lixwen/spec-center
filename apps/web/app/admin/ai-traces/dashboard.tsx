"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { showError } from "../../../lib/toast";

type RangeKey = "today" | "7d" | "30d";

type Labels = {
  totalRequests: string;
  errorRate: string;
  avgLatency: string;
  p95Latency: string;
  totalTokens: string;
  estCost: string;
  rangeToday: string;
  range7d: string;
  range30d: string;
  loadFailed: string;
  noRows: string;
  trendDay: string;
  trendRequests: string;
  trendErrors: string;
  toolUsage: string;
  toolName: string;
  toolCalls: string;
  spansTitle: string;
  spanType: string;
  spanName: string;
  spanDuration: string;
  spanStatus: string;
  expand: string;
  collapse: string;
  clientTtft: string;
  clientStream: string;
  table: {
    time: string;
    status: string;
    model: string;
    rounds: string;
    toolCalls: string;
    duration: string;
    tokens: string;
  };
  statusRunning: string;
  statusCompleted: string;
  statusError: string;
  statusTimeout: string;
};

interface TraceRow {
  traceId: string;
  createdAt: string;
  status: string;
  model: string;
  agentRounds: number;
  toolCallCount: number;
  totalDurationMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  clientMetrics?: { ttftMs?: number; streamDurationMs?: number; completed?: boolean };
}

interface StatsPayload {
  totalTraces: number;
  errorRate: number;
  avgDurationMs: number | null;
  p95DurationMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalEstimatedCostUsd: number;
  toolUsage: { toolName: string; count: number }[];
  dailyTrend: { day: string; count: number; errors: number }[];
}

interface SpanRow {
  spanId: string;
  type: string;
  name: string;
  startTime: string;
  durationMs: number;
  status: string;
  tool?: { toolName?: string };
}

function boundsForRange(range: RangeKey): { fromIso: string; toIso: string } {
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

function statusTone(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200";
    case "running":
      return "bg-amber-100 text-amber-900 ring-1 ring-amber-200";
    case "error":
      return "bg-rose-100 text-rose-900 ring-1 ring-rose-200";
    case "timeout":
      return "bg-orange-100 text-orange-900 ring-1 ring-orange-200";
    default:
      return "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
  }
}

function formatStatus(status: string, labels: Labels): string {
  switch (status) {
    case "completed":
      return labels.statusCompleted;
    case "running":
      return labels.statusRunning;
    case "error":
      return labels.statusError;
    case "timeout":
      return labels.statusTimeout;
    default:
      return status;
  }
}

export function AdminAiTracesDashboard({
  labels,
  totalSuffix,
  workingLabel
}: {
  labels: Labels;
  totalSuffix: string;
  workingLabel: string;
}) {
  const [range, setRange] = useState<RangeKey>("7d");
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [items, setItems] = useState<TraceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailByTrace, setDetailByTrace] = useState<
    Record<string, { trace: TraceRow; spans: SpanRow[] }>
  >({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const rangeQuery = range === "today" ? "today" : range === "30d" ? "30d" : "7d";
  const { fromIso, toIso } = useMemo(() => boundsForRange(range), [range]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qsStats = new URLSearchParams({ range: rangeQuery });
      const qsList = new URLSearchParams({
        page: "1",
        pageSize: "50",
        from: fromIso,
        to: toIso
      });

      const [statsRes, listRes] = await Promise.all([
        fetch(`/api/ai-traces/stats?${qsStats}`, { credentials: "include" }),
        fetch(`/api/ai-traces?${qsList}`, { credentials: "include" })
      ]);

      if (!statsRes.ok || !listRes.ok) {
        showError(labels.loadFailed);
        return;
      }

      const statsJson = (await statsRes.json()) as StatsPayload;
      const listJson = (await listRes.json()) as { items: TraceRow[]; total: number };
      setStats(statsJson);
      setItems(listJson.items ?? []);
      setTotal(listJson.total ?? 0);
    } catch {
      showError(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso, labels.loadFailed, rangeQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = async (traceId: string) => {
    if (expanded === traceId) {
      setExpanded(null);
      return;
    }
    setExpanded(traceId);
    if (detailByTrace[traceId]) return;
    setDetailLoading(traceId);
    try {
      const res = await fetch(`/api/ai-traces/${encodeURIComponent(traceId)}`, {
        credentials: "include"
      });
      if (!res.ok) {
        showError(labels.loadFailed);
        return;
      }
      const data = (await res.json()) as { trace: TraceRow; spans: SpanRow[] };
      setDetailByTrace((prev) => ({ ...prev, [traceId]: data }));
    } catch {
      showError(labels.loadFailed);
    } finally {
      setDetailLoading(null);
    }
  };

  const statFmt = (n: number | null | undefined, digits = 0) =>
    n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(digits);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {(
            [
              ["today", labels.rangeToday],
              ["7d", labels.range7d],
              ["30d", labels.range30d]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                range === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading ? (
          <span className="text-xs text-slate-400">{workingLabel}</span>
        ) : (
          <span className="text-xs text-slate-500">
            {total} {totalSuffix}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {labels.totalRequests}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {stats?.totalTraces ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {labels.errorRate}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {stats ? `${(stats.errorRate * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {labels.avgLatency}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {statFmt(stats?.avgDurationMs ?? null, 0)} ms
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {labels.p95Latency}: {statFmt(stats?.p95DurationMs ?? null, 0)} ms
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {labels.totalTokens}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {stats ? stats.totalPromptTokens + stats.totalCompletionTokens : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {labels.estCost}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            ${statFmt(stats?.totalEstimatedCostUsd ?? null, 4)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="mb-3 font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {labels.toolUsage}
          </p>
          <div className="max-h-48 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="pb-2 font-medium">{labels.toolName}</th>
                  <th className="pb-2 font-medium text-right">{labels.toolCalls}</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.toolUsage ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-3 text-slate-400">
                      —
                    </td>
                  </tr>
                ) : (
                  stats!.toolUsage.map((t) => (
                    <tr key={t.toolName} className="border-b border-slate-100">
                      <td className="py-1.5 font-mono text-xs">{t.toolName}</td>
                      <td className="py-1.5 text-right tabular-nums">{t.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="mb-3 font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {labels.trendDay}
          </p>
          <div className="max-h-48 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="pb-2 font-medium">{labels.trendDay}</th>
                  <th className="pb-2 font-medium text-right">{labels.trendRequests}</th>
                  <th className="pb-2 font-medium text-right">{labels.trendErrors}</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.dailyTrend ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-3 text-slate-400">
                      —
                    </td>
                  </tr>
                ) : (
                  stats!.dailyTrend.map((d) => (
                    <tr key={d.day} className="border-b border-slate-100">
                      <td className="py-1.5 tabular-nums text-xs">{d.day}</td>
                      <td className="py-1.5 text-right tabular-nums">{d.count}</td>
                      <td className="py-1.5 text-right tabular-nums text-rose-600">{d.errors}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[var(--surface-card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">{labels.table.time}</th>
                <th className="px-4 py-3 font-medium">{labels.table.status}</th>
                <th className="px-4 py-3 font-medium">{labels.table.model}</th>
                <th className="px-4 py-3 font-medium text-right">{labels.table.rounds}</th>
                <th className="px-4 py-3 font-medium text-right">{labels.table.toolCalls}</th>
                <th className="px-4 py-3 font-medium text-right">{labels.table.duration}</th>
                <th className="px-4 py-3 font-medium text-right">{labels.table.tokens}</th>
                <th className="px-4 py-3 font-medium w-28" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    {labels.noRows}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <Fragment key={row.traceId}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(row.status)}`}
                        >
                          {formatStatus(row.status, labels)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{row.model}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.agentRounds}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.toolCallCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.totalDurationMs}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {(row.totalPromptTokens ?? 0) + (row.totalCompletionTokens ?? 0)}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => void toggleExpand(row.traceId)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          {expanded === row.traceId ? labels.collapse : labels.expand}
                        </button>
                      </td>
                    </tr>
                    {expanded === row.traceId ? (
                      <tr className="border-b border-slate-200 bg-slate-50/50">
                        <td colSpan={8} className="px-4 py-4">
                          {detailLoading === row.traceId ? (
                            <p className="text-xs text-slate-500">{workingLabel}</p>
                          ) : detailByTrace[row.traceId] ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                                {detailByTrace[row.traceId]!.trace.clientMetrics?.ttftMs != null && (
                                  <span>
                                    {labels.clientTtft}:{" "}
                                    <strong className="tabular-nums text-slate-900">
                                      {detailByTrace[row.traceId]!.trace.clientMetrics!.ttftMs}
                                    </strong>
                                  </span>
                                )}
                                {detailByTrace[row.traceId]!.trace.clientMetrics?.streamDurationMs != null && (
                                  <span>
                                    {labels.clientStream}:{" "}
                                    <strong className="tabular-nums text-slate-900">
                                      {detailByTrace[row.traceId]!.trace.clientMetrics!.streamDurationMs}
                                    </strong>
                                  </span>
                                )}
                              </div>
                              <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                {labels.spansTitle}
                              </p>
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <table className="min-w-full text-left text-xs">
                                  <thead className="border-b border-slate-200 bg-slate-50">
                                    <tr className="text-slate-500">
                                      <th className="px-3 py-2 font-medium">{labels.spanType}</th>
                                      <th className="px-3 py-2 font-medium">{labels.spanName}</th>
                                      <th className="px-3 py-2 font-medium text-right">{labels.spanDuration}</th>
                                      <th className="px-3 py-2 font-medium">{labels.spanStatus}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailByTrace[row.traceId]!.spans.map((sp) => (
                                      <tr key={sp.spanId} className="border-b border-slate-100">
                                        <td className="px-3 py-1.5 font-mono">{sp.type}</td>
                                        <td className="px-3 py-1.5">
                                          {sp.type === "tool" && sp.tool?.toolName ? sp.tool.toolName : sp.name}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{sp.durationMs}</td>
                                        <td className="px-3 py-1.5">{sp.status}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">{labels.loadFailed}</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
