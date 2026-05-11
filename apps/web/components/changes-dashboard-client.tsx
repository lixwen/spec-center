"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Card, DataTable, StatusBadge } from "./ui";

type DashboardEntry = {
  change: {
    _id: string;
    title: string;
    status: string;
    sprint?: string | null;
    repo_changes: Array<{
      type?: string;
      repo?: string;
      branch?: string;
      url?: string;
      label?: string;
    }>;
  };
  repos?: string[];
  reviewer_users?: string[];
  review_progress: {
    approved: number;
    total: number;
    pending: number;
  };
  last_synced_at: string | null;
  new_version_count: number;
  blocker_count: number;
  blocker_labels: string[];
  recommendation_count: number;
  cross_spec_issue_count: number;
};

type DashboardSummary = {
  active_change_count: number;
  blocked_change_count: number;
  in_review_count: number;
  total_open_comments: number;
  approved_change_count: number;
};

export function ChangesDashboardClient({
  entries,
  summary,
  locale,
  messages
}: {
  entries: DashboardEntry[];
  summary: DashboardSummary;
  locale: "en" | "zh-CN";
  messages: {
    common: { noValue: string };
    changes: {
      metrics: {
        activeChanges: string;
        blockedChanges: string;
        inReview: string;
        openComments: string;
      };
      reviewIntent: string;
      readyToArchive: string;
      blockers: string;
      clearPath: string;
      operatorSignals: string;
      reviewerSignals: string;
      noBlockers: string;
      sprintAll: string;
      sprintNone: string;
      sprintColumn: string;
      dataBlocks: {
        never: string;
        driftAlerts: string;
        noNewerSnapshots: string;
      };
    };
  };
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sprintFilter, setSprintFilter] = useState("all");
  const [reviewerFilter, setReviewerFilter] = useState("all");
  const [repoFilter, setRepoFilter] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const sprintOptions = useMemo(
    () =>
      Array.from(
        new Set(
          entries
            .map((entry) => entry.change.sprint)
            .filter((s): s is string => typeof s === "string" && s.length > 0)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [entries]
  );

  const repoOptions = useMemo(
    () =>
      Array.from(
        new Set(
          entries.flatMap((entry) =>
            entry.repos && entry.repos.length > 0
              ? entry.repos
              : entry.change.repo_changes
                  .filter((b) => b.type === "repo" || !b.type)
                  .map((b) => b.repo!)
                  .filter(Boolean)
          )
        )
      ).sort((left, right) =>
        left.localeCompare(right)
      ),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      const firstRepo = entry.change.repo_changes.find((b) => b.type === "repo" || !b.type);
      const repo = firstRepo?.repo ?? "";
      const branch = firstRepo?.branch ?? "";
      const matchesQuery =
        !normalized ||
        [entry.change._id, entry.change.title, repo, branch]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesStatus =
        statusFilter === "all" || entry.change.status === statusFilter;
      const matchesReviewer =
        reviewerFilter === "all" ||
        (reviewerFilter === "pending" && entry.review_progress.pending > 0) ||
        (reviewerFilter === "approved" &&
          entry.review_progress.total > 0 &&
          entry.review_progress.pending === 0) ||
        (reviewerFilter === "none" && entry.review_progress.total === 0);
      const matchesSprint =
        sprintFilter === "all" ||
        (sprintFilter === "__none__"
          ? !entry.change.sprint
          : entry.change.sprint === sprintFilter);
      const matchesRepo =
        repoFilter === "all" ||
        (entry.repos && entry.repos.length > 0
          ? entry.repos.includes(repoFilter)
          : entry.change.repo_changes.some((b) => (b.type === "repo" || !b.type) && b.repo === repoFilter));

      return matchesQuery && matchesStatus && matchesSprint && matchesReviewer && matchesRepo;
    });
  }, [deferredQuery, entries, repoFilter, reviewerFilter, sprintFilter, statusFilter]);

  return (
    <>
      <section className="rounded-lg bg-[var(--surface-low)] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="min-w-[220px] flex-1">
            <span className="sr-only">Filter by Change ID or title</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by Change ID or title..."
              className="w-full rounded-lg bg-[var(--surface-card)] px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-[var(--tertiary)]/30"
            />
          </label>
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Status: All" },
              { value: "draft", label: "Status: draft" },
              { value: "in_review", label: "Status: in review" },
              { value: "changes_requested", label: "Status: changes requested" },
              { value: "approved", label: "Status: approved" },
              { value: "archived", label: "Status: archived" }
            ]}
          />
          <FilterSelect
            label="Sprint"
            value={sprintFilter}
            onChange={setSprintFilter}
            options={[
              { value: "all", label: messages.changes.sprintAll },
              { value: "__none__", label: messages.changes.sprintNone },
              ...sprintOptions.map((s) => ({ value: s, label: `Sprint: ${s}` }))
            ]}
          />
          <FilterSelect
            label="Reviewers"
            value={reviewerFilter}
            onChange={setReviewerFilter}
            options={[
              { value: "all", label: "Reviewers: Anyone" },
              { value: "pending", label: "Reviewers: Pending" },
              { value: "approved", label: "Reviewers: Fully approved" },
              { value: "none", label: "Reviewers: No review started" }
            ]}
          />
          <FilterSelect
            label="Repo"
            value={repoFilter}
            onChange={setRepoFilter}
            options={[
              { value: "all", label: "Repo: All" },
              ...repoOptions.map((repoName) => ({
                value: repoName,
                label: `Repo: ${repoName}`
              }))
            ]}
          />
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <DataTable headers={["ID", "Title", messages.changes.sprintColumn, "Status", "Reviewers", "Progress", "Sync"]}>
            {filteredEntries.map((entry) => (
              <tr
                key={entry.change._id}
                className="border-t border-[rgba(115,118,134,0.08)] transition-colors hover:bg-[var(--surface-low)]"
              >
                <td className="px-5 py-5 align-top">
                  <Link
                    href={`/changes/${entry.change._id}`}
                    className="font-[family-name:var(--font-mono)] text-xs font-bold text-[var(--tertiary)]"
                  >
                    {entry.change._id}
                  </Link>
                </td>
                <td className="px-5 py-5 align-top">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{entry.change.title}</p>
                    {(() => {
                      const first = entry.change.repo_changes.find((b) => b.type === "repo" || !b.type);
                      return first ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {first.repo} / {first.branch}
                        </p>
                      ) : null;
                    })()}
                  </div>
                </td>
                <td className="px-5 py-5 align-top">
                  {entry.change.sprint ? (
                    <span className="inline-flex rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 font-[family-name:var(--font-label)] text-[11px] font-medium text-[#131b2e]">
                      {entry.change.sprint}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-5 py-5 align-top">
                  <StatusBadge status={entry.change.status} locale={locale} />
                </td>
                <td className="px-5 py-5 align-top">
                  <div className="flex items-center gap-2">
                    {renderReviewerDots(entry.review_progress.total)}
                    <span className="font-[family-name:var(--font-label)] text-xs text-slate-500">
                      {entry.review_progress.total || 0}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-5 align-top">
                  <div className="space-y-2">
                    <div className="h-2 rounded-full bg-[var(--surface-high)]">
                      <div
                        className="h-2 rounded-full bg-[var(--tertiary)]"
                        style={{
                          width: `${
                            entry.review_progress.total > 0
                              ? (entry.review_progress.approved / entry.review_progress.total) * 100
                              : 0
                          }%`
                        }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      {entry.review_progress.approved}/{entry.review_progress.total || 0}
                    </p>
                  </div>
                </td>
                <td className="px-5 py-5 align-top">
                  <div className="space-y-1 text-xs text-slate-500">
                    <p>
                      {entry.last_synced_at
                        ? shortStamp(entry.last_synced_at)
                        : messages.changes.dataBlocks.never}
                    </p>
                    <p>
                      {entry.new_version_count > 0
                        ? `${entry.new_version_count} ${messages.changes.dataBlocks.driftAlerts}`
                        : messages.changes.dataBlocks.noNewerSnapshots}
                    </p>
                  </div>
                </td>
              </tr>
            ))}
            {filteredEntries.length === 0 ? (
              <tr className="border-t border-[rgba(115,118,134,0.08)]">
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                  {messages.common.noValue}
                </td>
              </tr>
            ) : null}
          </DataTable>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={messages.changes.metrics.activeChanges} value={summary.active_change_count} />
            <MetricCard label={messages.changes.metrics.blockedChanges} value={summary.blocked_change_count} />
            <MetricCard label={messages.changes.metrics.inReview} value={summary.in_review_count} />
            <MetricCard label={messages.changes.metrics.openComments} value={summary.total_open_comments} />
          </div>
        </div>

        <aside className="space-y-6">
          <Card className="bg-[var(--surface-low)]">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {messages.changes.reviewIntent}
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-5xl font-extrabold tracking-[-0.05em] text-slate-900">
              {summary.approved_change_count}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{messages.changes.readyToArchive}</p>
          </Card>

          <Card className="bg-[var(--surface-card)]">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {messages.changes.operatorSignals}
            </p>
            <div className="mt-4 space-y-3">
              {filteredEntries.slice(0, 3).map((entry) => (
                <div key={entry.change._id} className="rounded-lg bg-[var(--surface-low)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-[family-name:var(--font-mono)] text-[11px] text-slate-500">
                      {entry.change._id}
                    </p>
                    <span className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {entry.blocker_count > 0
                        ? `${entry.blocker_count} ${messages.changes.blockers}`
                        : messages.changes.clearPath}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">{entry.change.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {entry.blocker_labels[0] ?? messages.changes.noBlockers}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-[#13232d] text-white">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-white/45">
              {messages.changes.reviewerSignals}
            </p>
            <div className="mt-4 space-y-3">
              {filteredEntries.slice(0, 3).map((entry) => (
                <div key={entry.change._id} className="rounded-lg bg-white/7 px-4 py-3">
                  <p className="font-[family-name:var(--font-mono)] text-[11px] text-white/50">
                    {entry.change._id}
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">
                    {entry.recommendation_count} recommendation signals
                  </p>
                  <p className="mt-1 text-sm text-white/68">
                    {entry.cross_spec_issue_count} change-wide findings
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="bg-[var(--surface-low)]">
      <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-4 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.04em] text-slate-900">
        {value}
      </p>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="min-w-[190px]">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg bg-[var(--surface-card)] px-4 py-3 font-[family-name:var(--font-label)] text-sm text-slate-700 outline-none focus:ring-1 focus:ring-[var(--tertiary)]/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function renderReviewerDots(total: number) {
  const dots = Array.from({ length: Math.min(total, 3) });

  return (
    <div className="flex -space-x-2">
      {dots.map((_, index) => (
        <span
          key={index}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold ${
            index === 0
              ? "bg-[var(--primary-soft)] text-[#131b2e]"
              : index === 1
                ? "bg-[var(--surface-high)] text-slate-700"
                : "bg-[var(--surface-dim)] text-slate-600"
          }`}
        >
          {index + 1}
        </span>
      ))}
    </div>
  );
}

function shortStamp(value: string) {
  return value.replace("T", " ").replace("Z", "");
}
