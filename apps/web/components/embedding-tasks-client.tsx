"use client";

import { useState, useCallback } from "react";
import { showSuccess, showError } from "../lib/toast";

interface EmbeddingTaskItem {
  _id: string;
  doc_type: "snapshot" | "change" | "comment";
  doc_id: string;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

interface EmbeddingTaskStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

interface Messages {
  stats: { pending: string; processing: string; done: string; failed: string };
  reindex: string;
  reindexing: string;
  reindexSuccess: string;
  reindexTaskCount: string;
  retry: string;
  retrying: string;
  retrySuccess: string;
  retryFailed: string;
  reset: string;
  resetting: string;
  resetSuccess: string;
  resetFailed: string;
  table: {
    id: string;
    docType: string;
    status: string;
    error: string;
    createdAt: string;
    updatedAt: string;
  };
  filters: { all: string; pending: string; processing: string; done: string; failed: string };
  empty: string;
  emptyDescription: string;
  totalTasks: string;
}

const STATUS_TONES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  processing: "bg-blue-100 text-blue-900",
  done: "bg-emerald-100 text-emerald-900",
  failed: "bg-rose-100 text-rose-900"
};

const STAT_ACCENTS: Record<string, string> = {
  pending: "border-l-amber-400",
  processing: "border-l-blue-400",
  done: "border-l-emerald-400",
  failed: "border-l-rose-400"
};

export function EmbeddingTasksClient({
  initialStats,
  initialItems,
  initialTotal,
  messages
}: {
  initialStats: EmbeddingTaskStats;
  initialItems: EmbeddingTaskItem[];
  initialTotal: number;
  messages: Messages;
}) {
  const [stats, setStats] = useState(initialStats);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const pageSize = 20;

  const fetchData = useCallback(
    async (filter: string, p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
        if (filter) params.set("status", filter);
        const res = await fetch(`/api/embedding-tasks?${params}`);
        if (!res.ok) {
          showError(messages.retryFailed);
          throw new Error();
        }
        const data = await res.json();
        setStats(data.stats);
        setItems(data.items);
        setTotal(data.total);
      } finally {
        setLoading(false);
      }
    },
    [pageSize, messages.retryFailed]
  );

  const handleFilter = useCallback(
    (filter: string) => {
      setActiveFilter(filter);
      setPage(1);
      fetchData(filter, 1);
    },
    [fetchData]
  );

  const handlePage = useCallback(
    (p: number) => {
      setPage(p);
      fetchData(activeFilter, p);
    },
    [fetchData, activeFilter]
  );

  const handleReindex = useCallback(async () => {
    setReindexing(true);
    try {
      const res = await fetch("/api/embedding-tasks/reindex", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      showSuccess(`${messages.reindexSuccess}: ${data.taskCount} ${messages.reindexTaskCount}`);
      await fetchData(activeFilter, 1);
      setPage(1);
    } finally {
      setReindexing(false);
    }
  }, [fetchData, activeFilter, messages]);

  const handleRetry = useCallback(
    async (taskId: string) => {
      setRetryingId(taskId);
      try {
        const res = await fetch(`/api/embedding-tasks/${taskId}/retry`, { method: "POST" });
        if (!res.ok) {
          showError(messages.retryFailed);
          return;
        }
        showSuccess(messages.retrySuccess);
        await fetchData(activeFilter, page);
      } finally {
        setRetryingId(null);
      }
    },
    [fetchData, activeFilter, page, messages]
  );

  const handleReset = useCallback(
    async (taskId: string) => {
      setResettingId(taskId);
      try {
        const res = await fetch(`/api/embedding-tasks/${taskId}/reset`, { method: "POST" });
        if (!res.ok) {
          showError(messages.resetFailed);
          return;
        }
        showSuccess(messages.resetSuccess);
        await fetchData(activeFilter, page);
      } finally {
        setResettingId(null);
      }
    },
    [fetchData, activeFilter, page, messages]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const statEntries: Array<{ key: keyof EmbeddingTaskStats; label: string }> = [
    { key: "pending", label: messages.stats.pending },
    { key: "processing", label: messages.stats.processing },
    { key: "done", label: messages.stats.done },
    { key: "failed", label: messages.stats.failed }
  ];
  const filterKeys: Array<{ key: string; label: string }> = [
    { key: "", label: messages.filters.all },
    { key: "pending", label: messages.filters.pending },
    { key: "processing", label: messages.filters.processing },
    { key: "done", label: messages.filters.done },
    { key: "failed", label: messages.filters.failed }
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {statEntries.map(({ key, label }) => (
          <div
            key={key}
            className={`rounded-lg border-l-4 bg-[var(--surface-low)] p-4 ${STAT_ACCENTS[key]}`}
          >
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.2em] text-slate-500">
              {label}
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.04em]">
              {stats[key]}
            </p>
          </div>
        ))}
      </div>

      {/* Toolbar: filters + reindex */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {filterKeys.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleFilter(key)}
              className={`rounded-md px-3 py-1.5 font-[family-name:var(--font-label)] text-xs font-medium transition-colors ${
                activeFilter === key
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface-low)] text-slate-600 hover:bg-[var(--surface-high)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={handleReindex}
          disabled={reindexing}
          className="rounded-lg bg-gradient-to-br from-[var(--primary)] to-[#656d84] px-4 py-2 font-[family-name:var(--font-label)] text-sm font-bold text-white disabled:opacity-50"
        >
          {reindexing ? messages.reindexing : messages.reindex}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-[var(--surface-card)]">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[var(--surface-low)] font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-5 py-4 font-medium">{messages.table.id}</th>
              <th className="px-5 py-4 font-medium">{messages.table.docType}</th>
              <th className="px-5 py-4 font-medium">{messages.table.status}</th>
              <th className="px-5 py-4 font-medium">{messages.table.error}</th>
              <th className="px-5 py-4 font-medium">{messages.table.createdAt}</th>
              <th className="px-5 py-4 font-medium">{messages.table.updatedAt}</th>
              <th className="px-5 py-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                  <p className="font-medium">{messages.empty}</p>
                  <p className="mt-1 text-xs">{messages.emptyDescription}</p>
                </td>
              </tr>
            ) : (
              items.map((task) => (
                <tr
                  key={task._id}
                  className="border-t border-slate-100 transition-colors hover:bg-[var(--surface-low)]"
                >
                  <td className="px-5 py-3 font-[family-name:var(--font-mono)] text-xs text-slate-500">
                    {task._id}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-wider text-slate-600">
                      {task.doc_type}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] ${STATUS_TONES[task.status] ?? "bg-slate-100 text-slate-900"}`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-5 py-3 text-xs text-rose-600">
                    {task.error ?? "—"}
                  </td>
                  <td className="px-5 py-3 font-[family-name:var(--font-mono)] text-xs text-slate-500">
                    {new Date(task.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 font-[family-name:var(--font-mono)] text-xs text-slate-500">
                    {new Date(task.updated_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      {task.status === "failed" && (
                        <button
                          onClick={() => handleRetry(task._id)}
                          disabled={retryingId === task._id}
                          className="rounded bg-rose-50 px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] font-medium uppercase text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                        >
                          {retryingId === task._id ? messages.retrying : messages.retry}
                        </button>
                      )}
                      {(task.status === "done" || task.status === "failed") && (
                        <button
                          onClick={() => handleReset(task._id)}
                          disabled={resettingId === task._id}
                          className="rounded bg-slate-100 px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] font-medium uppercase text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50"
                        >
                          {resettingId === task._id ? messages.resetting : messages.reset}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {total} {messages.totalTasks}
          </p>
          <div className="flex gap-1">
            {page > 1 && (
              <button
                onClick={() => handlePage(page - 1)}
                className="rounded-md bg-[var(--surface-low)] px-3 py-1.5 text-xs text-slate-600 hover:bg-[var(--surface-high)]"
              >
                ←
              </button>
            )}
            <span className="rounded-md bg-[var(--primary-soft)] px-3 py-1.5 font-[family-name:var(--font-label)] text-xs font-medium text-[var(--primary)]">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <button
                onClick={() => handlePage(page + 1)}
                className="rounded-md bg-[var(--surface-low)] px-3 py-1.5 text-xs text-slate-600 hover:bg-[var(--surface-high)]"
              >
                →
              </button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--primary)]" />
        </div>
      )}
    </div>
  );
}
