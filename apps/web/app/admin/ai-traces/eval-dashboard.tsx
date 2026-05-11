"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { getMessages } from "../../../lib/i18n";
import { showError } from "../../../lib/toast";
import { EvalProgress } from "./eval-progress";
import { EvalRunModal } from "./eval-run-modal";

export type EvalLabels = ReturnType<typeof getMessages>["evalAdmin"];

type EvalRunRow = {
  runId: string;
  runAt: string;
  model: string;
  totalExamples: number;
  passRate: number;
  avgScore: number;
  byCategory: Record<string, { count: number; avgScore: number; passRate: number }>;
  byEvaluator: Record<string, { avgScore: number; passRate: number }>;
};

type EvalResultRow = {
  runId: string;
  exampleId: string;
  category: string;
  evaluator: string;
  score: number;
  label: string;
  reason?: string;
  traceId?: string;
  durationMs: number;
};

type StatsRun = {
  runAt: string;
  model?: string;
  passRate?: number;
  avgScore?: number;
  byCategory?: EvalRunRow["byCategory"];
  byEvaluator?: EvalRunRow["byEvaluator"];
};

function passRateTextClass(rate: number): string {
  if (rate >= 0.8) return "text-emerald-700";
  if (rate >= 0.6) return "text-amber-700";
  return "text-rose-700";
}

function passRateBarClass(rate: number): string {
  if (rate >= 0.8) return "bg-emerald-500";
  if (rate >= 0.6) return "bg-amber-500";
  return "bg-rose-500";
}

function scoreBarClass(score: number): string {
  if (score >= 0.8) return "bg-emerald-500";
  if (score >= 0.6) return "bg-amber-500";
  return "bg-rose-500";
}

function fmtScore(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(3);
}

export function EvalDashboard({ labels }: { labels: EvalLabels }) {
  const [items, setItems] = useState<EvalRunRow[]>([]);
  const [statsRuns, setStatsRuns] = useState<StatsRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailByRun, setDetailByRun] = useState<Record<string, EvalResultRow[]>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, statsRes] = await Promise.all([
        fetch(`/api/eval/runs?page=1&limit=20`, { credentials: "include" }),
        fetch(`/api/eval/stats?limit=10`, { credentials: "include" })
      ]);

      if (!runsRes.ok || !statsRes.ok) {
        showError(labels.loadFailed);
        return;
      }

      const runsJson = (await runsRes.json()) as { items: EvalRunRow[] };
      const statsJson = (await statsRes.json()) as { runs: StatsRun[] };
      setItems(runsJson.items ?? []);
      setStatsRuns(statsJson.runs ?? []);
    } catch {
      showError(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [labels.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const evaluatorNames = useMemo(() => {
    const keys = new Set<string>();
    for (const r of statsRuns) {
      for (const k of Object.keys(r.byEvaluator ?? {})) {
        keys.add(k);
      }
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [statsRuns]);

  const categorySource = items[0]?.byCategory ?? statsRuns[0]?.byCategory ?? {};
  const categoryEntries = useMemo(
    () => Object.entries(categorySource).sort(([a], [b]) => a.localeCompare(b)),
    [categorySource]
  );

  const toggleExpand = async (runId: string) => {
    if (expanded === runId) {
      setExpanded(null);
      return;
    }
    setExpanded(runId);
    if (detailByRun[runId]) return;
    setDetailLoading(runId);
    try {
      const res = await fetch(`/api/eval/runs/${encodeURIComponent(runId)}`, {
        credentials: "include"
      });
      if (!res.ok) {
        showError(labels.loadFailed);
        return;
      }
      const data = (await res.json()) as { results: EvalResultRow[] };
      const failed = (data.results ?? []).filter((r) => r.label !== "pass");
      setDetailByRun((prev) => ({ ...prev, [runId]: failed }));
    } catch {
      showError(labels.loadFailed);
    } finally {
      setDetailLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      {activeRunId ? (
        <EvalProgress
          runId={activeRunId}
          onComplete={() => {
            setActiveRunId(null);
            void load();
          }}
          labels={labels}
        />
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!!activeRunId}
          onClick={() => setRunModalOpen(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
        >
          {labels.runEval}
        </button>
      </div>

      <EvalRunModal
        open={runModalOpen}
        onClose={() => setRunModalOpen(false)}
        onStarted={(runId) => {
          setRunModalOpen(false);
          setActiveRunId(runId);
        }}
        labels={labels}
      />

      {loading && items.length === 0 && statsRuns.length === 0 ? (
        <p className="text-xs text-slate-400">…</p>
      ) : null}

      {!loading && items.length === 0 && statsRuns.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-6 text-center text-sm text-slate-500 shadow-sm">
          {labels.noRuns}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="mb-3 font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {labels.evaluatorScores}
          </p>
          <div className="max-h-64 overflow-auto">
            <table className="min-w-full w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="pb-2 font-medium">{labels.runTime}</th>
                  {evaluatorNames.map((name) => (
                    <th key={name} className="pb-2 font-medium">
                      <span className="font-mono">{name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statsRuns.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, evaluatorNames.length) + 1} className="py-3 text-slate-400">
                      —
                    </td>
                  </tr>
                ) : (
                  statsRuns.map((run, idx) => (
                    <tr key={`${run.runAt}-${idx}`} className="border-b border-slate-100">
                      <td className="py-2 align-top text-xs text-slate-600 whitespace-nowrap">
                        {new Date(run.runAt).toLocaleString()}
                      </td>
                      {evaluatorNames.map((name) => {
                        const cell = run.byEvaluator?.[name];
                        const score = cell?.avgScore ?? 0;
                        const pct = Math.min(100, Math.max(0, score * 100));
                        return (
                          <td key={name} className="py-2 align-top">
                            <div className="flex min-w-[7rem] flex-col gap-1">
                              <div className="h-2 w-full rounded bg-slate-100">
                                <div
                                  className={`h-2 rounded ${scoreBarClass(score)}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-[11px] text-slate-700">{fmtScore(score)}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="mb-3 font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {labels.categoryPassRate}
          </p>
          {categoryEntries.length === 0 ? (
            <p className="text-sm text-slate-400">—</p>
          ) : (
            <div className="space-y-4">
              {categoryEntries.map(([cat, s]) => (
                <div key={cat}>
                  <div className="mb-1 flex justify-between gap-2 text-xs text-slate-600">
                    <span className="font-medium">{cat}</span>
                    <span className={`tabular-nums font-medium ${passRateTextClass(s.passRate)}`}>
                      {(s.passRate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-2.5 min-w-0 rounded-full ${passRateBarClass(s.passRate)}`}
                      style={{ width: `${Math.min(100, s.passRate * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[var(--surface-card)] shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {labels.runHistory}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">{labels.runTime}</th>
                <th className="px-4 py-3 font-medium text-right">{labels.examples}</th>
                <th className="px-4 py-3 font-medium text-right">{labels.passRate}</th>
                <th className="px-4 py-3 font-medium text-right">{labels.avgScore}</th>
                <th className="px-4 py-3 font-medium">{labels.model}</th>
                <th className="px-4 py-3 font-medium w-28" />
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    …
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {labels.noRuns}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <Fragment key={row.runId}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(row.runAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.totalExamples}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`tabular-nums font-medium ${passRateTextClass(row.passRate)}`}>
                          {(row.passRate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                        {fmtScore(row.avgScore)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{row.model}</td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => void toggleExpand(row.runId)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          {labels.details}
                        </button>
                      </td>
                    </tr>
                    {expanded === row.runId ? (
                      <tr className="border-b border-slate-200 bg-slate-50/50">
                        <td colSpan={6} className="px-4 py-4">
                          <p className="mb-2 font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.14em] text-slate-500">
                            {labels.failedExamples}
                          </p>
                          {detailLoading === row.runId ? (
                            <p className="text-xs text-slate-500">…</p>
                          ) : detailByRun[row.runId] && detailByRun[row.runId]!.length === 0 ? (
                            <p className="text-xs text-slate-400">—</p>
                          ) : detailByRun[row.runId] ? (
                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                              <table className="min-w-full text-left text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50">
                                  <tr className="text-slate-500">
                                    <th className="px-3 py-2 font-medium">{labels.evaluator}</th>
                                    <th className="px-3 py-2 font-medium text-right">{labels.score}</th>
                                    <th className="px-3 py-2 font-medium">{labels.reason}</th>
                                    <th className="px-3 py-2 font-medium" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailByRun[row.runId]!.map((r, i) => (
                                    <tr key={`${r.exampleId}-${r.evaluator}-${i}`} className="border-b border-slate-100">
                                      <td className="px-3 py-1.5 font-mono">{r.evaluator}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtScore(r.score)}</td>
                                      <td className="px-3 py-1.5 text-slate-700">{r.reason ?? "—"}</td>
                                      <td className="px-3 py-1.5 text-right">
                                        {r.traceId ? (
                                          <a
                                            href={`/api/ai-traces/${encodeURIComponent(r.traceId)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-blue-600 hover:text-blue-800"
                                          >
                                            {labels.viewTrace}
                                          </a>
                                        ) : (
                                          <span className="text-slate-300">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
