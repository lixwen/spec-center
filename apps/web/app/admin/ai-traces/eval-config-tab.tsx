"use client";

import { useCallback, useEffect, useState } from "react";
import type { getMessages } from "../../../lib/i18n";
import { showError, showSuccess } from "../../../lib/toast";

type EvalLabels = ReturnType<typeof getMessages>["evalAdmin"];

type EvaluatorRow = {
  name: string;
  enabled: boolean;
  params?: Record<string, number | string | boolean>;
};

const EVALUATOR_TYPE: Record<string, "code-based" | "llm-judge"> = {
  "tool-selection": "code-based",
  "trajectory-efficiency": "code-based",
  "cost-threshold": "code-based",
  "keyword-coverage": "code-based",
  "llm-judge": "llm-judge"
} as const;

const BUILTIN_ORDER = [
  "tool-selection",
  "trajectory-efficiency",
  "cost-threshold",
  "keyword-coverage",
  "llm-judge"
] as const;

type ApiPayload = {
  evaluators: EvaluatorRow[];
  defaultPassThreshold: number;
};

function normalizeEvaluators(list: EvaluatorRow[]): EvaluatorRow[] {
  const map = new Map(list.map((e) => [e.name, { ...e, params: e.params ? { ...e.params } : undefined }]));
  const ordered: EvaluatorRow[] = [];
  for (const name of BUILTIN_ORDER) {
    const row = map.get(name);
    if (row) ordered.push(row);
    else ordered.push({ name, enabled: true });
  }
  for (const e of list) {
    if (!BUILTIN_ORDER.includes(e.name as (typeof BUILTIN_ORDER)[number])) {
      ordered.push({ ...e, params: e.params ? { ...e.params } : undefined });
    }
  }
  return ordered;
}

function cloneState(payload: ApiPayload): ApiPayload {
  return {
    defaultPassThreshold: payload.defaultPassThreshold,
    evaluators: payload.evaluators.map((e) => ({
      ...e,
      params: e.params ? { ...e.params } : undefined
    }))
  };
}

function readCostParams(params: Record<string, number | string | boolean> | undefined) {
  const maxCostUsd =
    typeof params?.maxCostUsd === "number" && Number.isFinite(params.maxCostUsd)
      ? params.maxCostUsd
      : 0.1;
  const maxTokens =
    typeof params?.maxTokens === "number" && Number.isFinite(params.maxTokens)
      ? params.maxTokens
      : 50_000;
  return { maxCostUsd, maxTokens };
}

function readRoundMultiplier(params: Record<string, number | string | boolean> | undefined) {
  const v = params?.roundMultiplier;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return 1;
}

function buildPutBody(evaluators: EvaluatorRow[], defaultPassThreshold: number): ApiPayload {
  const bodyEvaluators = evaluators.map((e) => {
    const base = { name: e.name, enabled: e.enabled };
    if (e.name === "cost-threshold") {
      const { maxCostUsd, maxTokens } = readCostParams(e.params);
      return { ...base, params: { maxCostUsd, maxTokens } };
    }
    if (e.name === "trajectory-efficiency") {
      const roundMultiplier = readRoundMultiplier(e.params);
      return { ...base, params: { roundMultiplier } };
    }
    const next: EvaluatorRow = { ...base };
    if (e.params && Object.keys(e.params).length > 0) {
      next.params = { ...e.params };
    }
    return next;
  });
  return { evaluators: bodyEvaluators, defaultPassThreshold };
}

export function EvalConfigTab({
  labels,
  workingLabel
}: {
  labels: EvalLabels;
  workingLabel?: string;
}) {
  const [evaluators, setEvaluators] = useState<EvaluatorRow[]>([]);
  const [defaultPassThreshold, setDefaultPassThreshold] = useState(0.7);
  const [baseline, setBaseline] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [persisting, setPersisting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/eval/config");
      if (!res.ok) {
        showError(labels.loadFailed);
        return;
      }
      const data = (await res.json()) as ApiPayload;
      const norm = normalizeEvaluators(data.evaluators ?? []);
      const t =
        typeof data.defaultPassThreshold === "number" && Number.isFinite(data.defaultPassThreshold)
          ? Math.min(1, Math.max(0, data.defaultPassThreshold))
          : 0.7;
      const payload = { evaluators: norm, defaultPassThreshold: t };
      setEvaluators(payload.evaluators);
      setDefaultPassThreshold(payload.defaultPassThreshold);
      setBaseline(cloneState(payload));
    } catch {
      showError(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [labels.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistConfig = async (nextEvaluators: EvaluatorRow[], threshold: number) => {
    setPersisting(true);
    try {
      const body = buildPutBody(nextEvaluators, threshold);
      const res = await fetch("/api/eval/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        showError(labels.loadFailed);
        return false;
      }
      const saved = (await res.json()) as ApiPayload;
      const norm = normalizeEvaluators(saved.evaluators ?? []);
      const t =
        typeof saved.defaultPassThreshold === "number" && Number.isFinite(saved.defaultPassThreshold)
          ? Math.min(1, Math.max(0, saved.defaultPassThreshold))
          : threshold;
      const payload = { evaluators: norm, defaultPassThreshold: t };
      setEvaluators(payload.evaluators);
      setDefaultPassThreshold(payload.defaultPassThreshold);
      setBaseline(cloneState(payload));
      showSuccess(labels.savedSuccess);
      return true;
    } catch {
      showError(labels.loadFailed);
      return false;
    } finally {
      setPersisting(false);
    }
  };

  const toggleEnabled = async (name: string) => {
    const prev = evaluators;
    const next = prev.map((e) => (e.name === name ? { ...e, enabled: !e.enabled } : e));
    setEvaluators(next);
    const ok = await persistConfig(next, defaultPassThreshold);
    if (!ok) {
      setEvaluators(prev);
    }
  };

  const updateEvaluatorParams = (name: string, params: Record<string, number | string | boolean>) => {
    setEvaluators((prev) =>
      prev.map((e) => (e.name === name ? { ...e, params: { ...e.params, ...params } } : e))
    );
  };

  const handleSaveFields = async () => {
    const thr = Math.min(1, Math.max(0, defaultPassThreshold));
    await persistConfig(evaluators, thr);
  };

  const handleCancel = () => {
    if (!baseline) return;
    const c = cloneState(baseline);
    setEvaluators(c.evaluators);
    setDefaultPassThreshold(c.defaultPassThreshold);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-6 shadow-sm text-sm text-slate-500">
        {workingLabel ?? "…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          {labels.passThreshold}
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={defaultPassThreshold}
            onChange={(e) => setDefaultPassThreshold(Number(e.target.value))}
            className="mt-1.5 block w-full max-w-xs border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">{labels.evalConfig}</h3>
        {evaluators.map((ev) => {
          const evType = EVALUATOR_TYPE[ev.name] ?? "code-based";
          const enabled = ev.enabled;
          return (
            <div
              key={ev.name}
              className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{ev.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      evType === "llm-judge"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {labels.type}: {evType}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">{labels.enabledLabel}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={persisting}
                    onClick={() => void toggleEnabled(ev.name)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                      enabled ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition ${
                        enabled ? "translate-x-4.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {ev.name === "cost-threshold" ? (
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <p className="text-sm font-medium text-slate-700">{labels.parameters}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-600">
                      maxCostUsd
                      <input
                        type="number"
                        step={0.01}
                        min={0}
                        value={readCostParams(ev.params).maxCostUsd}
                        onChange={(e) =>
                          updateEvaluatorParams(ev.name, {
                            maxCostUsd: Number(e.target.value)
                          })
                        }
                        className="mt-1 block w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-600">
                      maxTokens
                      <input
                        type="number"
                        step={100}
                        min={0}
                        value={readCostParams(ev.params).maxTokens}
                        onChange={(e) =>
                          updateEvaluatorParams(ev.name, {
                            maxTokens: Number(e.target.value)
                          })
                        }
                        className="mt-1 block w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              {ev.name === "trajectory-efficiency" ? (
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <p className="text-sm font-medium text-slate-700">{labels.parameters}</p>
                  <label className="block text-xs font-medium text-slate-600 max-w-xs">
                    roundMultiplier
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      value={readRoundMultiplier(ev.params)}
                      onChange={(e) =>
                        updateEvaluatorParams(ev.name, {
                          roundMultiplier: Number(e.target.value)
                        })
                      }
                      className="mt-1 block w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={persisting}
          onClick={() => void handleSaveFields()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {labels.saveConfig}
        </button>
        <button
          type="button"
          disabled={persisting || !baseline}
          onClick={handleCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
