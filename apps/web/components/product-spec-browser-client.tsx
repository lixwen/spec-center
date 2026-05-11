"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MarkdownFullscreenButton, MarkdownViewer } from "./markdown-viewer";
import { Card } from "./ui";

function PanelToggle({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[var(--surface-high)] hover:text-slate-600"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d={collapsed ? "M6 4l4 4-4 4" : "M10 4l-4 4 4 4"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

type ProductSpecItem = {
  _id: string;
  capability: string;
  repo: string;
  path: string;
  historyCount: number;
};

type ProductKnowledge = {
  spec: ProductSpecItem;
  snapshots: Array<{ _id: string; created_at: string; content: string }>;
  history: Array<{ change_id: string; title: string; note: string }>;
};

export function ProductSpecBrowserClient({
  specs,
  initialSpecId,
  knowledgeById,
  messages
}: {
  specs: ProductSpecItem[];
  initialSpecId: string;
  knowledgeById: Record<string, ProductKnowledge>;
  messages: {
    filterPlaceholder: string;
    activeLabel: string;
    totalSuffix: string;
    openBaseline: string;
    baselineEyebrow: string;
    noBaselineContent: string;
    evolutionTitle: string;
    evolutionDescription: string;
    historyEntries: string;
    snapshots: string;
    snapshotHistory: string;
    historyCountSuffix: string;
  };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return specs;
    }
    return specs.filter((spec) =>
      [spec.capability, spec.repo, spec.path].join(" ").toLowerCase().includes(normalized)
    );
  }, [query, specs]);

  const active = filtered.find((spec) => spec._id === initialSpecId) ?? filtered[0] ?? null;
  const knowledge = active ? knowledgeById[active._id] : null;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={`grid gap-8 transition-[grid-template-columns] duration-300 ${
      sidebarCollapsed
        ? "xl:grid-cols-[40px_minmax(0,1fr)]"
        : "xl:grid-cols-[240px_minmax(0,1fr)]"
    }`}>
      <section className="min-w-0 max-w-[240px]">
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center pt-1">
            <PanelToggle collapsed onClick={() => setSidebarCollapsed(false)} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="relative min-w-0 flex-1">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={messages.filterPlaceholder}
                  className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-8 pr-2 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-[rgba(0,90,130,0.2)] focus:bg-[var(--surface-highest)]"
                />
              </div>
              <PanelToggle collapsed={false} onClick={() => setSidebarCollapsed(true)} />
            </div>
            <div className="flex items-center justify-between px-1">
              <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {messages.activeLabel}
              </p>
              <span className="font-[family-name:var(--font-label)] text-xs text-[var(--tertiary)]">
                {filtered.length} {messages.totalSuffix}
              </span>
            </div>
            <div className="space-y-1">
              {filtered.map((spec) => {
                const selected = spec._id === active?._id;
                return (
                  <button
                    key={spec._id}
                    onClick={() => {
                      router.push(`/product-specs?spec=${spec._id}`);
                    }}
                    title={`${spec.capability}\n${spec.repo} · ${spec.historyCount} ${messages.historyCountSuffix}`}
                    className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "bg-[var(--surface-card)] ring-1 ring-inset ring-[rgba(0,90,130,0.18)]"
                        : "hover:bg-[var(--surface-high)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                      {spec.capability}
                    </span>
                    <span className="shrink-0 font-[family-name:var(--font-mono)] text-[11px] text-slate-400">
                      {spec.historyCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {knowledge ? (
        <section className="space-y-6">
          <Card className="bg-[var(--surface-card)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {messages.baselineEyebrow}
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.04em] text-slate-900">
                  {knowledge.spec.capability}
                </h2>
                <p className="mt-2 font-[family-name:var(--font-mono)] text-xs text-slate-500">
                  {knowledge.spec.path}
                </p>
              </div>
              <Link
                href={`/product-specs/${knowledge.spec._id}`}
                className="inline-flex rounded-lg bg-[var(--surface-low)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-[var(--surface-high)]"
              >
                {messages.openBaseline}
              </Link>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="bg-[var(--surface-card)]">
              <div className="rounded-lg bg-[var(--surface-low)] p-5">
                <div className="mb-3 flex justify-end">
                  <MarkdownFullscreenButton content={knowledge.snapshots[0]?.content ?? messages.noBaselineContent} />
                </div>
                <MarkdownViewer content={knowledge.snapshots[0]?.content ?? messages.noBaselineContent} />
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="bg-[#13232d] text-white">
                <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em]">
                  {messages.evolutionTitle}
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/72">{messages.evolutionDescription}</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white/8 p-4">
                    <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-white/45">
                      {messages.historyEntries}
                    </p>
                    <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold">
                      {knowledge.history.length}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/8 p-4">
                    <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-white/45">
                      {messages.snapshots}
                    </p>
                    <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold">
                      {knowledge.snapshots.length}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="bg-[var(--surface-low)]">
                <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {messages.snapshotHistory}
                </p>
                <div className="mt-4 space-y-3">
                  {knowledge.snapshots.slice(0, 4).map((snapshot) => (
                    <div key={snapshot._id} className="rounded-lg bg-[var(--surface-card)] px-4 py-4">
                      <p className="font-[family-name:var(--font-mono)] text-xs text-slate-500">{snapshot._id}</p>
                      <p className="mt-2 text-sm text-slate-700">{snapshot.created_at}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
