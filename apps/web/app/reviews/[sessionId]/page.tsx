import Link from "next/link";
import {
  getBaselineContext,
  getComments,
  getCrossSpecIssuesForSpec,
  getReviewBrief,
  getReviewerRecommendations,
  getReviewSession,
  getSpec,
  getSpecIssues,
  listSpecsForChange
} from "@spec-center/core";
import { ActionButton } from "../../../components/action-button";
import { CommentForm } from "../../../components/comment-form";
import { MarkdownFullscreenButton, MarkdownViewer } from "../../../components/markdown-viewer";
import { Card, EmptyState, StatusBadge } from "../../../components/ui";
import { getRequestMessages } from "../../../lib/locale";
import { requireCurrentUser } from "../../../lib/session";

export default async function ReviewWorkspacePage({
  params,
  searchParams
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ spec?: string; tab?: string }>;
}) {
  const { locale, messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { sessionId } = await params;
  const query = await searchParams;
  const session = await getReviewSession(sessionId, currentUser);

  if (!session) {
    return (
      <EmptyState
        title={messages.review.sessionNotFoundTitle}
        description={messages.review.sessionNotFoundDescription}
      />
    );
  }

  const specs = await listSpecsForChange(session.change_id);
  const activeSpec = (await getSpec(query.spec ?? specs[0]?._id ?? "")) ?? specs[0];

  if (!activeSpec) {
    return (
      <EmptyState
        title={messages.review.noSpecsTitle}
        description={messages.review.noSpecsDescription}
      />
    );
  }

  const context = await getBaselineContext(sessionId, activeSpec._id, currentUser);
  const comments = await getComments(sessionId, activeSpec._id);
  const brief = await getReviewBrief(activeSpec._id, sessionId, currentUser);
  const issues = await getSpecIssues(activeSpec._id, sessionId, currentUser);
  const crossSpec = await getCrossSpecIssuesForSpec(activeSpec._id, session.change_id, currentUser);
  const recommendations = await getReviewerRecommendations(session.change_id, currentUser);
  const activeTab = query.tab === "baseline" ? "baseline" : "delta";
  const currentAssignment = session.reviewers.find(
    (reviewer) => reviewer.user === currentUser.username
  );

  return (
    <div className="space-y-0">
      <section className="mb-6 flex items-center justify-between rounded-lg bg-[var(--surface-bright)] px-5 py-4">
        <div className="flex items-center gap-2 font-[family-name:var(--font-label)] text-sm text-slate-500">
          <span>{messages.layout.navigation.changes}</span>
          <span className="text-slate-300">/</span>
          <span>{session.change_id}</span>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-[var(--primary)]">{messages.review.eyebrow}</span>
        </div>
        <div className="flex items-center gap-3">
          {currentAssignment && currentAssignment.assigned_specs.includes(activeSpec._id) ? (
            <>
              <ActionButton
                label={messages.review.requestChanges}
                endpoint={`/api/reviews/${sessionId}/specs/${activeSpec._id}/reviewers/${encodeURIComponent(currentUser.username)}/request-changes`}
                className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--danger)]"
                pendingLabel={messages.common.working}
                errorLabel={messages.common.requestFailed}
              />
              <ActionButton
                label={messages.review.reviewerApprove}
                endpoint={`/api/reviews/${sessionId}/specs/${activeSpec._id}/reviewers/${encodeURIComponent(currentUser.username)}/approve`}
                className="rounded-lg bg-gradient-to-br from-[var(--primary)] to-[#656d84] px-5 py-2 text-sm font-bold text-white"
                pendingLabel={messages.common.working}
                errorLabel={messages.common.requestFailed}
              />
            </>
          ) : currentAssignment ? (
            <div className="rounded-lg bg-[var(--surface-low)] px-4 py-2 text-sm text-slate-600">
              {messages.review.specNotAssigned}
            </div>
          ) : (
            <div className="rounded-lg bg-[var(--surface-low)] px-4 py-2 text-sm text-slate-600">
              {messages.review.currentReviewerNotAssigned}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-0 overflow-hidden rounded-lg bg-[var(--surface-low)] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="border-r border-[rgba(115,118,134,0.08)] bg-[var(--surface-low)]">
          <div className="flex items-center justify-between px-4 py-4">
            <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {messages.review.specLedger}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-slate-400">
              {specs.length}
            </span>
          </div>
          <div className="space-y-6 px-2 pb-2">
            {groupByRepo(specs).map(([repo, items]) => (
              <div key={repo}>
                <div className="px-3 py-2 font-[family-name:var(--font-label)] text-sm font-semibold text-slate-600">
                  {repo}
                </div>
                <div className="space-y-1">
                  {items.map((spec) => (
                    <Link
                      key={spec._id}
                      href={`/reviews/${sessionId}?spec=${spec._id}&tab=${activeTab}`}
                      className={`flex items-center justify-between rounded-md px-4 py-3 transition-colors ${
                        spec._id === activeSpec._id
                          ? "bg-[var(--primary-soft)] text-[#131b2e]"
                          : "hover:bg-[var(--surface-high)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{spec.path.split("/").pop()}</p>
                        <p className="mt-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          {spec.capability}
                        </p>
                      </div>
                      {spec.new_version_available ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.14em] text-amber-800">
                          {messages.review.newVersion}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[780px] flex-col bg-[var(--surface-card)]">
          <div className="flex bg-[var(--surface-low)] px-4">
            <Link
              href={`/reviews/${sessionId}?spec=${activeSpec._id}&tab=delta`}
              className={`px-6 py-3 font-[family-name:var(--font-label)] text-sm ${
                activeTab === "delta"
                  ? "bg-[var(--surface-card)] font-bold text-slate-900"
                  : "text-slate-500"
              }`}
            >
              {messages.review.deltaSpec}
            </Link>
            <Link
              href={`/reviews/${sessionId}?spec=${activeSpec._id}&tab=baseline`}
              className={`px-6 py-3 font-[family-name:var(--font-label)] text-sm ${
                activeTab === "baseline"
                  ? "bg-[var(--surface-card)] font-bold text-slate-900"
                  : "text-slate-500"
              }`}
            >
              {messages.review.productBaseline}
            </Link>
          </div>

          <div className="grid flex-1 grid-rows-[minmax(0,1fr)_auto]">
            <div className="overflow-auto">
              <div className="grid min-h-full grid-cols-[56px_minmax(0,1fr)]">
                <div className="bg-[var(--surface-low)] px-3 py-6 text-right font-[family-name:var(--font-mono)] text-[11px] leading-6 text-slate-400">
                  {lineNumbers(
                    activeTab === "delta"
                      ? context.delta?.content ?? messages.review.noDeltaSnapshot
                      : context.productBaseline?.content ?? messages.review.noBaselineSnapshot
                  )}
                </div>
                <div className="px-6 py-6">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <StatusBadge status={activeSpec.review_status ?? "baseline"} locale={locale} />
                    <span className="rounded-full bg-[var(--surface-low)] px-3 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {messages.review.lockedBaseline}
                    </span>
                    <Link
                      href={`/docs/specs/${activeSpec._id}`}
                      className="font-[family-name:var(--font-mono)] text-xs text-[var(--tertiary)]"
                    >
                      {activeSpec.path}
                    </Link>
                  </div>
                  {(() => {
                    const specReviews = (session.spec_reviews ?? []).filter(
                      (r) => r.spec_id === activeSpec._id
                    );
                    const approvedCount = specReviews.filter((r) => r.status === "approved").length;
                    return specReviews.length > 0 ? (
                      <div className="mb-5 rounded-lg bg-[var(--surface-low)] px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
                            {messages.review.specReviewers}
                          </span>
                          <span className="font-[family-name:var(--font-mono)] text-xs text-slate-500">
                            {approvedCount}/{specReviews.length} {messages.review.approved}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {specReviews.map((r) => (
                            <div
                              key={`${r.spec_id}-${r.reviewer}`}
                              className="flex items-center gap-2 rounded-md bg-[var(--surface-card)] px-3 py-2"
                            >
                              <span className="text-sm font-medium text-slate-800">{r.reviewer}</span>
                              <StatusBadge status={r.status} locale={locale} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  <div className="mb-3 flex justify-end">
                    <MarkdownFullscreenButton
                      content={
                        activeTab === "delta"
                          ? context.delta?.content ?? messages.review.noDeltaSnapshot
                          : context.productBaseline?.content ?? messages.review.noBaselineSnapshot
                      }
                    />
                  </div>
                  <MarkdownViewer
                    content={
                      activeTab === "delta"
                        ? context.delta?.content ?? messages.review.noDeltaSnapshot
                        : context.productBaseline?.content ?? messages.review.noBaselineSnapshot
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[rgba(115,118,134,0.08)] bg-[var(--surface-bright)] px-6 py-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-slate-900">
                  {messages.review.commentThreads}
                </h3>
                <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  {comments.length} {messages.common.total}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {comments.map((comment) => (
                  <div key={comment._id} className="rounded-lg bg-[var(--surface-card)] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{comment.author}</p>
                        <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-slate-500">
                          {comment.anchor.heading_path} · {messages.common.line} {comment.anchor.line_hint}
                        </p>
                      </div>
                      <StatusBadge status={comment.status} locale={locale} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{comment.content}</p>
                    {comment.status === "open" ? (
                      <div className="mt-4">
                        <ActionButton
                          label={messages.review.resolve}
                          method="PATCH"
                          endpoint={`/api/comments/${comment._id}`}
                          body={{ status: "resolved" }}
                          className="rounded-md bg-[var(--surface-high)] px-4 py-2 text-sm font-medium text-slate-800"
                          pendingLabel={messages.common.working}
                          errorLabel={messages.common.requestFailed}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
                {comments.length === 0 ? (
                  <div className="rounded-lg bg-[var(--surface-card)] px-4 py-4 text-sm text-slate-600">
                    {messages.review.noComments}
                  </div>
                ) : null}
              </div>
              <div className="mt-4">
                <CommentForm
                  sessionId={sessionId}
                  specId={activeSpec._id}
                  author={currentUser.username}
                  placeholder={messages.forms.addCommentPlaceholder}
                  submitLabel={messages.forms.addComment}
                  errorLabel={messages.forms.createCommentFailed}
                  headingLabel={messages.forms.anchorHeading}
                  lineLabel={messages.forms.anchorLine}
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4 bg-[var(--surface-low)] p-4">
          <Card className="bg-[var(--surface-card)]">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {messages.review.aiBriefEyebrow}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-slate-900">
              {messages.review.aiBriefTitle}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{brief.overview}</p>
            <div className="mt-4 rounded-lg bg-[var(--surface-low)] px-4 py-3 text-sm text-slate-600">
              {brief.baselineMode === "with_product_baseline"
                ? messages.review.baselineAware
                : messages.review.noProductBaseline}
            </div>
            <div className="mt-4 space-y-4">
              <DetailList title={messages.review.scope} items={brief.scope} />
              <DetailList title={messages.review.keyChanges} items={brief.keyChanges} />
              <DetailList title={messages.review.reviewerFocus} items={brief.reviewerFocus} />
              <DetailList title={messages.review.risks} items={brief.risks} />
            </div>
          </Card>

          <Card className="bg-[#13232d] text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-white/45">
                  {messages.review.issuePanelEyebrow}
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-white">
                  {messages.review.issuePanelTitle}
                </h3>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-white/70">
                {issues.length} {messages.review.findings}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {issues.map((issue) => (
                <div key={`${issue.kind}-${issue.title}`} className="rounded-lg bg-white/7 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="rounded-full bg-white/10 px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-white/70">
                      {issue.kind}
                    </span>
                  </div>
                  <p className="mt-3 font-medium text-white">{issue.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">{issue.message}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-[var(--surface-card)]">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {messages.review.crossSpecEyebrow}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-slate-900">
              {messages.review.crossSpecTitle}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{crossSpec.scope}</p>
            <div className="mt-4 space-y-3">
              {crossSpec.findings.map((issue) => (
                <div key={`${issue.kind}-${issue.title}`} className="rounded-lg bg-[var(--surface-low)] px-4 py-4">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="rounded-full bg-[var(--surface-card)] px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-slate-600">
                      {issue.kind}
                    </span>
                  </div>
                  <p className="mt-3 font-medium text-slate-900">{issue.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{issue.message}</p>
                </div>
              ))}
              {crossSpec.findings.length === 0 ? (
                <div className="rounded-lg bg-[var(--surface-low)] px-4 py-4 text-sm text-slate-600">
                  {messages.review.noCrossSpec}
                </div>
              ) : null}
            </div>
            <div className="mt-4 rounded-lg bg-[var(--surface-low)] px-4 py-4">
              <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
                {messages.review.recommendedReviewers}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {recommendations.map((item) => item.user).join(", ")}
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function groupByRepo<T extends { repo: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const list = grouped.get(item.repo) ?? [];
    list.push(item);
    grouped.set(item.repo, list);
  }

  return Array.from(grouped.entries());
}

function lineNumbers(content: string) {
  const count = content.split("\n").length;
  return Array.from({ length: count }, (_, index) => index + 1).join("\n");
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="rounded-lg bg-[var(--surface-low)] px-4 py-3 text-sm leading-6 text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const className =
    severity === "high"
      ? "bg-rose-100 text-rose-800"
      : severity === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-sky-100 text-sky-800";

  return (
    <span className={`rounded-full px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] ${className}`}>
      {severity}
    </span>
  );
}
