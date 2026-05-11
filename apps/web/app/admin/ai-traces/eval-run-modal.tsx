"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { getMessages } from "../../../lib/i18n";
import { showError } from "../../../lib/toast";

type EvalLabels = ReturnType<typeof getMessages>["evalAdmin"];

type DatasetSummary = {
  _id: string;
  name: string;
  category: string;
};

type EvalRunModalProps = {
  open: boolean;
  onClose: () => void;
  onStarted: (runId: string) => void;
  labels: EvalLabels;
};

type CategoryChoice = string;

type EvalMode = "trace" | "agent" | "placeholder";

type TraceSummary = {
  traceId: string;
  query: string;
  model: string;
  totalDurationMs: number;
  agentRounds: number;
  toolCallCount: number;
  createdAt: string;
};

export function EvalRunModal({ open, onClose, onStarted, labels }: EvalRunModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [categoryChoice, setCategoryChoice] = useState<CategoryChoice>("");
  const [codeOnly, setCodeOnly] = useState(false);
  const [items, setItems] = useState<DatasetSummary[]>([]);
  const [conflict, setConflict] = useState(false);
  const [mode, setMode] = useState<EvalMode>("agent");
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const [traceSearch, setTraceSearch] = useState("");
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [traceFieldError, setTraceFieldError] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      if (!map.has(it.category)) map.set(it.category, it.name);
    }
    return [...map.entries()]
      .map(([category, name]) => ({ category, name }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [items]);

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setConflict(false);
    try {
      const res = await fetch("/api/eval/datasets?page=1&limit=100", { credentials: "include" });
      if (!res.ok) {
        showError(labels.loadFailed);
        return;
      }
      const data = (await res.json()) as { items: DatasetSummary[] };
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [labels.loadFailed]);

  const fetchTracesList = useCallback(async (q: string) => {
    setTracesLoading(true);
    try {
      const res = await fetch(`/api/eval/traces?q=${encodeURIComponent(q)}&limit=10`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = (await res.json()) as { items?: TraceSummary[] };
        setTraces(data.items ?? []);
      }
    } finally {
      setTracesLoading(false);
    }
  }, []);

  const handleTraceSearch = useCallback(
    (q: string) => {
      setTraceSearch(q);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        void fetchTracesList(q);
      }, 300);
    },
    [fetchTracesList]
  );

  useLayoutEffect(() => {
    if (!open) return;
    setMode("agent");
    setSelectedTraceId("");
    setTraces([]);
    setTraceSearch("");
    setTraceFieldError(false);
    setCategoryChoice("");
    setCodeOnly(false);
    setConflict(false);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadDatasets();
  }, [open, loadDatasets]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open || mode !== "trace") return;
    void fetchTracesList(traceSearch);
  }, [open, mode, fetchTracesList]);

  useEffect(() => {
    if (mode !== "trace") setTraceFieldError(false);
  }, [mode]);

  useEffect(() => {
    if (selectedTraceId) setTraceFieldError(false);
  }, [selectedTraceId]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (mode === "trace" && !selectedTraceId) {
      setTraceFieldError(true);
      return;
    }

    setSubmitting(true);
    setConflict(false);
    setTraceFieldError(false);
    try {
      const body: Record<string, unknown> = {};
      if (categoryChoice) body.category = categoryChoice;

      if (mode === "trace") {
        body.mode = "trace";
        body.traceId = selectedTraceId;
      } else if (mode === "agent") {
        body.mode = "agent";
        if (codeOnly) body.codeOnly = true;
      } else {
        body.codeOnly = true;
      }

      if (mode !== "placeholder" && codeOnly) body.codeOnly = true;

      const res = await fetch("/api/eval/trigger", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.status === 409) {
        setConflict(true);
        return;
      }

      if (!res.ok) {
        showError(labels.loadFailed);
        return;
      }

      const data = (await res.json()) as { runId?: string };
      if (data.runId) onStarted(data.runId);
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDuration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const modeCards: { value: EvalMode; label: string; desc: string }[] = [
    { value: "trace", label: labels.modeTrace, desc: labels.modeTraceDesc },
    { value: "agent", label: labels.modeAgent, desc: labels.modeAgentDesc },
    { value: "placeholder", label: labels.modePlaceholder, desc: labels.modePlaceholderDesc }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eval-run-modal-title"
    >
      <div className="max-w-lg w-full rounded-2xl bg-white shadow-xl">
        <div className="max-h-[80vh] overflow-y-auto p-6">
          <h2 id="eval-run-modal-title" className="text-sm font-medium text-slate-900">
            {labels.runConfig}
          </h2>

          <div className="mt-4">
            <div className="text-xs font-medium text-slate-700">{labels.evalMode}</div>
            <div className="mt-2 space-y-2">
              {modeCards.map(({ value, label, desc }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    mode === value ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="eval-mode"
                    className="mt-1 border-slate-300 text-slate-900"
                    checked={mode === value}
                    onChange={() => setMode(value)}
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900">{label}</div>
                    <div className="text-xs text-slate-500">{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {mode === "trace" ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-slate-700">{labels.selectTrace}</div>
              <input
                type="text"
                value={traceSearch}
                placeholder={labels.searchTrace}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                onChange={(e) => handleTraceSearch(e.target.value)}
              />
              {traceFieldError ? (
                <p className="text-xs font-medium text-rose-700">{labels.traceRequired}</p>
              ) : null}
              <div className="space-y-2">
                {tracesLoading ? (
                  <p className="text-xs text-slate-400">…</p>
                ) : traces.length === 0 ? (
                  <p className="text-xs text-slate-500">{labels.noTraces}</p>
                ) : (
                  traces.map((t) => {
                    const qPreview =
                      t.query.length > 80 ? `${t.query.slice(0, 80)}…` : t.query || t.traceId;
                    const selected = selectedTraceId === t.traceId;
                    return (
                      <button
                        key={t.traceId}
                        type="button"
                        onClick={() => setSelectedTraceId(t.traceId)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          selected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-sm text-slate-900">{qPreview}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {t.model} · {fmtDuration(t.totalDurationMs)} · {t.agentRounds} rounds
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">{fmtDate(t.createdAt)}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          <p className="mt-4 text-xs text-slate-500">{labels.selectDatasets}</p>

          <div className="mt-2 space-y-3">
            {loading ? (
              <p className="text-xs text-slate-400">…</p>
            ) : categoryOptions.length === 0 ? (
              <p className="text-xs text-slate-500">{labels.noDatasets}</p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="sr-only">{labels.selectDatasets}</legend>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="eval-category"
                    className="border-slate-300 text-slate-900"
                    checked={categoryChoice === ""}
                    onChange={() => setCategoryChoice("")}
                  />
                  <span className="font-medium">{labels.allCategories}</span>
                </label>
                {categoryOptions.map(({ category, name }) => (
                  <label
                    key={category}
                    className="flex cursor-pointer items-center gap-2 text-sm text-slate-800"
                  >
                    <input
                      type="radio"
                      name="eval-category"
                      className="border-slate-300 text-slate-900"
                      checked={categoryChoice === category}
                      onChange={() => setCategoryChoice(category)}
                    />
                    <span>
                      <span className="font-medium">{name}</span>
                      <span className="text-slate-500"> ({category})</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>

          {mode !== "placeholder" ? (
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-0.5 border-slate-300 rounded text-slate-900"
                checked={codeOnly}
                onChange={(e) => setCodeOnly(e.target.checked)}
              />
              <span className="font-medium">{labels.codeOnlyMode}</span>
            </label>
          ) : null}

          {submitting && mode === "agent" ? (
            <p className="mt-3 text-xs text-slate-500">{labels.agentRunning}</p>
          ) : null}

          {conflict ? <p className="mt-3 text-xs font-medium text-amber-800">{labels.runningConflict}</p> : null}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={submitting || loading || categoryOptions.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {labels.confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
