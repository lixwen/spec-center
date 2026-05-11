"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showError } from "../lib/toast";

type RepoBinding = {
  type: "repo";
  repo: string;
  branch: string;
  change_name: string;
};

type UrlLink = {
  type: "url";
  url: string;
  label?: string;
};

type LinkedAsset = RepoBinding | UrlLink;

export function ChangeBindingsEditor({
  changeId,
  version,
  bindings,
  labels
}: {
  changeId: string;
  version: number;
  bindings: LinkedAsset[];
  labels: {
    title: string;
    edit: string;
    save: string;
    cancel: string;
    synced: string;
    error: string;
    remove?: string;
    addRepo?: string;
    addUrl?: string;
    repoPlaceholder?: string;
    branchPlaceholder?: string;
    changeNamePlaceholder?: string;
    urlPlaceholder?: string;
    urlLabelPlaceholder?: string;
    emptyHint?: string;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const normalized: LinkedAsset[] = bindings.map((b) => {
    if ("type" in b && b.type) return b;
    const legacy = b as RepoBinding;
    return { type: "repo" as const, repo: legacy.repo, branch: legacy.branch, change_name: legacy.change_name };
  });
  const [draft, setDraft] = useState<LinkedAsset[]>(normalized);

  async function save() {
    setPending(true);
    const response = await fetch(`/api/changes/${changeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_changes: draft,
        version
      })
    });
    setPending(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      showError(payload?.error ?? labels.error);
      return;
    }

    setEditing(false);
    router.refresh();
  }

  function updateDraft(index: number, patch: Record<string, unknown>) {
    setDraft((items) =>
      items.map((item, i) =>
        i === index ? (Object.assign({}, item, patch) as LinkedAsset) : item
      )
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-slate-900">
          {labels.title}
        </h2>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDraft(normalized);
                setEditing(false);
              }}
              className="font-[family-name:var(--font-label)] text-sm text-slate-500"
            >
              {labels.cancel}
            </button>
            <button
              onClick={() => void save()}
              disabled={pending}
              className="rounded-lg bg-[var(--tertiary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "..." : labels.save}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="font-[family-name:var(--font-label)] text-sm text-[var(--tertiary)]"
          >
            {labels.edit}
          </button>
        )}
      </div>
      <div className={`mt-5 ${editing ? "space-y-3" : "space-y-1"}`}>
        {draft.map((asset, index) =>
          editing ? (
            <div
              key={`${asset.type}-${index}`}
              className="flex items-center gap-4 rounded-lg bg-[var(--surface-card)] px-4 py-4"
            >
              {asset.type === "repo" ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--surface-high)] font-[family-name:var(--font-label)] text-xs font-bold text-slate-500">
                  {(asset.repo || "os").slice(0, 2).toUpperCase()}
                </div>
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
              )}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {asset.type === "repo" ? (
                  <div className="grid flex-1 gap-2 md:grid-cols-3">
                    <input
                      value={asset.repo}
                      placeholder={labels.repoPlaceholder ?? "repo"}
                      onChange={(e) => updateDraft(index, { repo: e.target.value })}
                      className="rounded-lg bg-[var(--surface-low)] px-3 py-2 text-sm outline-none placeholder:text-slate-400"
                    />
                    <input
                      value={asset.branch}
                      placeholder={labels.branchPlaceholder ?? "branch"}
                      onChange={(e) => updateDraft(index, { branch: e.target.value })}
                      className="rounded-lg bg-[var(--surface-low)] px-3 py-2 text-sm outline-none placeholder:text-slate-400"
                    />
                    <input
                      value={asset.change_name}
                      placeholder={labels.changeNamePlaceholder ?? "change_name"}
                      onChange={(e) => updateDraft(index, { change_name: e.target.value })}
                      className="rounded-lg bg-[var(--surface-low)] px-3 py-2 text-sm outline-none placeholder:text-slate-400"
                    />
                  </div>
                ) : (
                  <div className="grid flex-1 gap-2 md:grid-cols-2">
                    <input
                      value={asset.url}
                      placeholder={labels.urlPlaceholder ?? "https://..."}
                      onChange={(e) => updateDraft(index, { url: e.target.value })}
                      className="rounded-lg bg-[var(--surface-low)] px-3 py-2 text-sm outline-none placeholder:text-slate-400"
                    />
                    <input
                      value={asset.label ?? ""}
                      placeholder={labels.urlLabelPlaceholder ?? "Label (optional)"}
                      onChange={(e) => updateDraft(index, { label: e.target.value || undefined })}
                      className="rounded-lg bg-[var(--surface-low)] px-3 py-2 text-sm outline-none placeholder:text-slate-400"
                    />
                  </div>
                )}
                <button
                  onClick={() => setDraft((items) => items.filter((_, i) => i !== index))}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                  title={labels.remove ?? "Remove"}
                >
                  ×
                </button>
              </div>
            </div>
          ) : asset.type === "repo" ? (
            <a
              key={`${asset.type}-${index}`}
              href={`/changes/${asset.change_name}`}
              title={`${asset.change_name}\n${asset.branch} · ${asset.repo}`}
              className="flex items-center gap-3 rounded-lg bg-[var(--surface-card)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-high)]"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                {asset.change_name}
              </span>
              <span className="shrink-0 font-[family-name:var(--font-mono)] text-[11px] text-slate-400">
                {asset.branch} · {asset.repo}
              </span>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-emerald-800">
                {labels.synced}
              </span>
            </a>
          ) : (
            <a
              key={`${asset.type}-${index}`}
              href={asset.url}
              target="_blank"
              rel="noopener noreferrer"
              title={asset.url}
              className="flex items-center gap-3 rounded-lg bg-[var(--surface-card)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-high)]"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                {asset.label || truncateUrl(asset.url)}
              </span>
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-blue-800">
                Link
              </span>
            </a>
          )
        )}
        {editing && draft.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">
            {labels.emptyHint ?? "No linked assets yet. Click a button below to add one."}
          </p>
        )}
        {editing && (
          <div className="flex gap-3">
            <button
              onClick={() =>
                setDraft((items) => [
                  ...items,
                  { type: "repo", repo: "", branch: "", change_name: "" }
                ])
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-[var(--tertiary)] hover:text-[var(--tertiary)]"
            >
              <span className="text-lg leading-none">+</span>
              {labels.addRepo ?? "Add Repo Binding"}
            </button>
            <button
              onClick={() =>
                setDraft((items) => [...items, { type: "url", url: "" }])
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 px-4 py-3 text-sm font-medium text-blue-500 transition-colors hover:border-blue-500 hover:text-blue-600"
            >
              <span className="text-lg leading-none">+</span>
              {labels.addUrl ?? "Add URL Link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function truncateUrl(url: string, maxLength = 60) {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength - 3) + "...";
}
