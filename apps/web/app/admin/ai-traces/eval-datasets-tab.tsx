"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { getMessages } from "../../../lib/i18n";
import { showError, showSuccess } from "../../../lib/toast";

export type EvalLabels = ReturnType<typeof getMessages>["evalAdmin"];

type DatasetListItem = {
  _id: string;
  name: string;
  category: string;
  description?: string;
  updatedAt: string;
  createdBy?: string;
  exampleCount?: number;
};

function kebabCaseCategory(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseExamplesJson(text: string): unknown {
  return JSON.parse(text);
}

async function downloadExport(id: string, fallbackName: string) {
  const res = await fetch(`/api/eval/datasets/${encodeURIComponent(id)}/export`, {
    credentials: "include"
  });
  if (!res.ok) {
    throw new Error(String(res.status));
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = `${fallbackName.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`;
  const m = cd?.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/);
  if (m) {
    filename = decodeURIComponent(m[1] ?? m[2] ?? filename);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EvalDatasetsTab({ labels }: { labels: EvalLabels }) {
  const [items, setItems] = useState<DatasetListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createDescription, setCreateDescription] = useState("");

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [examplesJson, setExamplesJson] = useState("");
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importCategory, setImportCategory] = useState("");
  const [importParsedExamples, setImportParsedExamples] = useState<unknown[] | null>(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/eval/datasets?page=1&limit=100", { credentials: "include" });
      if (!res.ok) {
        showError(labels.loadFailed);
        return;
      }
      const data = (await res.json()) as { items: DatasetListItem[]; total: number };
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      showError(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [labels.loadFailed]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openCreate = () => {
    setCreating(true);
    setEditingId(null);
    setCreateName("");
    setCreateCategory("");
    setCreateDescription("");
  };

  const cancelCreate = () => {
    setCreating(false);
  };

  const submitCreate = async () => {
    const category = kebabCaseCategory(createCategory);
    if (!createName.trim() || !category) {
      showError(labels.loadFailed);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/eval/datasets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          category,
          ...(createDescription.trim() ? { description: createDescription.trim() } : {})
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showError(err.error ?? labels.loadFailed);
        return;
      }
      showSuccess(labels.savedSuccess);
      setCreating(false);
      await loadList();
    } catch {
      showError(labels.loadFailed);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = async (id: string) => {
    setCreating(false);
    setEditingId(id);
    setExamplesError(null);
    setEditLoading(true);
    try {
      const res = await fetch(`/api/eval/datasets/${encodeURIComponent(id)}`, {
        credentials: "include"
      });
      if (!res.ok) {
        showError(labels.loadFailed);
        setEditingId(null);
        return;
      }
      const doc = (await res.json()) as {
        name: string;
        description?: string;
        examples: unknown[];
      };
      setEditName(doc.name);
      setEditDescription(doc.description ?? "");
      setExamplesJson(JSON.stringify(doc.examples ?? [], null, 2));
    } catch {
      showError(labels.loadFailed);
      setEditingId(null);
    } finally {
      setEditLoading(false);
    }
  };

  const closeEdit = () => {
    setEditingId(null);
    setExamplesError(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    let parsed: unknown[];
    try {
      const raw = parseExamplesJson(examplesJson);
      if (!Array.isArray(raw)) {
        setExamplesError("Examples must be a JSON array");
        return;
      }
      parsed = raw;
      setExamplesError(null);
    } catch (e) {
      setExamplesError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!editName.trim()) {
      showError(labels.loadFailed);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/eval/datasets/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          examples: parsed
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showError(err.error ?? labels.loadFailed);
        return;
      }
      showSuccess(labels.savedSuccess);
      await loadList();
    } catch {
      showError(labels.loadFailed);
    } finally {
      setSaving(false);
    }
  };

  const deleteDataset = async () => {
    if (!editingId) return;
    if (!window.confirm(labels.confirm)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/eval/datasets/${encodeURIComponent(editingId)}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) {
        showError(labels.loadFailed);
        return;
      }
      showSuccess(labels.deletedSuccess);
      closeEdit();
      await loadList();
    } catch {
      showError(labels.loadFailed);
    } finally {
      setSaving(false);
    }
  };

  const openImportModal = () => {
    setImportOpen(true);
    setImportName("");
    setImportCategory("");
    setImportParsedExamples(null);
  };

  const onImportFilePick = () => {
    fileInputRef.current?.click();
  };

  const onImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      const examples = Array.isArray(data) ? data : (data as { examples?: unknown })?.examples;
      if (!Array.isArray(examples)) {
        showError(labels.loadFailed);
        return;
      }
      setImportParsedExamples(examples);
    } catch {
      showError(labels.loadFailed);
    }
  };

  const submitImport = async () => {
    const category = kebabCaseCategory(importCategory);
    if (!importName.trim() || !category || !importParsedExamples) {
      showError(labels.loadFailed);
      return;
    }
    setImportSubmitting(true);
    try {
      const res = await fetch("/api/eval/datasets/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importName.trim(),
          category,
          examples: importParsedExamples
        })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showError(err.error ?? labels.loadFailed);
        return;
      }
      showSuccess(labels.importedSuccess);
      setImportOpen(false);
      setImportParsedExamples(null);
      await loadList();
    } catch {
      showError(labels.loadFailed);
    } finally {
      setImportSubmitting(false);
    }
  };

  const btnPrimary =
    "inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50";
  const btnSecondary =
    "inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={openCreate}>
          {labels.createDataset}
        </button>
        <button type="button" className={btnSecondary} onClick={openImportModal}>
          {labels.importJson}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void onImportFileChange(e)}
        />
        {total > 0 ? (
          <span className="ml-1 text-xs text-slate-500 tabular-nums">{total}</span>
        ) : null}
      </div>

      {creating ? (
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <p className="mb-3 font-medium text-slate-900">{labels.createDataset}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{labels.datasetName}</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{labels.datasetCategory}</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-slate-400"
                value={createCategory}
                onChange={(e) => setCreateCategory(e.target.value)}
                placeholder="kebab-case"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">{labels.datasetDescription}</span>
              <textarea
                className="min-h-[4rem] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={saving} onClick={() => void submitCreate()}>
              {labels.confirm}
            </button>
            <button type="button" className={btnSecondary} disabled={saving} onClick={cancelCreate}>
              {labels.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {editingId ? (
        <div className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-slate-900">{labels.editDataset}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} onClick={closeEdit}>
                {labels.cancel}
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                disabled={saving || editLoading}
                onClick={() => void deleteDataset()}
              >
                {labels.deleteDataset}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={saving || editLoading}
                onClick={() => void saveEdit()}
              >
                {labels.confirm}
              </button>
            </div>
          </div>
          {editLoading ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{labels.datasetName}</span>
                <input
                  className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{labels.datasetDescription}</span>
                <textarea
                  className="min-h-[4rem] w-full max-w-2xl rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </label>
              <div>
                <p className="mb-1 text-sm text-slate-600">examples (JSON)</p>
                <textarea
                  className="min-h-[240px] w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 font-mono text-xs outline-none focus:border-slate-400"
                  value={examplesJson}
                  onChange={(e) => {
                    setExamplesJson(e.target.value);
                    setExamplesError(null);
                  }}
                  spellCheck={false}
                />
                {examplesError ? <p className="mt-1 text-sm text-rose-600">{examplesError}</p> : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {!loading && items.length === 0 && !creating && !editingId ? (
        <p className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-6 text-center text-sm text-slate-500 shadow-sm">
          {labels.noDatasets}
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="text-xs text-slate-400">…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((row) => (
            <button
              key={row._id}
              type="button"
              onClick={() => void openEdit(row._id)}
              className="rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="font-medium leading-snug text-slate-900">{row.name}</span>
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {row.category}
                </span>
              </div>
              {row.description ? (
                <p className="mb-3 line-clamp-2 text-xs text-slate-600">{row.description}</p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {labels.exampleCount}:{" "}
                  <span className="tabular-nums font-medium text-slate-700">
                    {row.exampleCount ?? "—"}
                  </span>
                </span>
                <span className="tabular-nums whitespace-nowrap">
                  {new Date(row.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() =>
                    void downloadExport(row._id, row.name || row.category).catch(() =>
                      showError(labels.loadFailed)
                    )
                  }
                >
                  {labels.exportJson}
                </button>
              </div>
            </button>
          ))}
        </div>
      )}
      {importOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={() => {
            if (!importSubmitting) setImportOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-[var(--surface-card)] p-4 shadow-lg"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-medium text-slate-900">{labels.importJson}</p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{labels.datasetName}</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{labels.datasetCategory}</span>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-slate-400"
                  value={importCategory}
                  onChange={(e) => setImportCategory(e.target.value)}
                  placeholder="kebab-case"
                />
              </label>
              <div>
                <button type="button" className={btnSecondary} onClick={onImportFilePick}>
                  {importParsedExamples
                    ? `${labels.importJson} (${importParsedExamples.length})`
                    : labels.importJson}
                </button>
                {!importParsedExamples ? (
                  <p className="mt-1 text-xs text-slate-500">
                    JSON array of examples, or an object with an &quot;examples&quot; array.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={btnSecondary}
                disabled={importSubmitting}
                onClick={() => setImportOpen(false)}
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={importSubmitting || !importParsedExamples}
                onClick={() => void submitImport()}
              >
                {labels.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
