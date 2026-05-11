"use client";

import { useEffect, useRef, useState } from "react";
import type { getMessages } from "../../../lib/i18n";

type EvalLabels = ReturnType<typeof getMessages>["evalAdmin"];

type ProgressPayload = {
  status?: string;
  progress?: {
    completedExamples?: number;
    totalExamples?: number;
    currentEvaluator?: string;
  };
  passRate?: number;
  avgScore?: number;
  error?: string;
};

type EvalProgressProps = {
  runId: string;
  onComplete: () => void;
  labels: EvalLabels;
};

const POLL_MS = 3000;

export function EvalProgress({ runId, onComplete, labels }: EvalProgressProps) {
  const [payload, setPayload] = useState<ProgressPayload | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let finished = false;

    const complete = () => {
      if (finished || cancelled) return;
      finished = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      onCompleteRef.current();
    };

    const tick = async () => {
      if (finished || cancelled) return;
      try {
        const res = await fetch(`/api/eval/runs/${encodeURIComponent(runId)}/progress`, {
          credentials: "include"
        });
        if (!res.ok || cancelled || finished) return;
        const data = (await res.json()) as ProgressPayload;
        if (cancelled || finished) return;
        setPayload(data);
        const s = data.status;
        if (s === "completed" || s === "failed") {
          complete();
        }
      } catch {
        /* ignore transient errors; next poll */
      }
    };

    void tick();
    timer = setInterval(() => void tick(), POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [runId]);

  const completed = payload?.progress?.completedExamples ?? 0;
  const total = payload?.progress?.totalExamples ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const currentEv = payload?.progress?.currentEvaluator?.trim() || "—";

  return (
    <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.14em] text-slate-500">
          {labels.progress}
        </p>
        <span className="text-xs font-medium text-slate-600">
          {labels.running}{" "}
          <span className="font-mono text-slate-500">{runId.slice(0, 12)}…</span>
        </span>
      </div>
      <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-2.5 min-w-0 rounded-full bg-slate-900 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600">
        <span className="tabular-nums font-medium">
          {completed} / {total}
        </span>
        <span>
          <span className="text-slate-500">{labels.evaluator}:</span>{" "}
          <span className="font-mono font-medium text-slate-800">{currentEv}</span>
        </span>
      </div>
      {payload?.error ? (
        <p className="mt-2 text-xs font-medium text-rose-700">{payload.error}</p>
      ) : null}
    </div>
  );
}
