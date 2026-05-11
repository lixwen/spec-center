import Link from "next/link";
import {
  getChange,
  getCurrentReviewSessionForChange,
  listSpecsForChange
} from "@spec-center/core";
import { ActionButton } from "../../../components/action-button";
import { ChangeBindingsEditor } from "../../../components/change-bindings-editor";
import { DeleteChangeButton } from "../../../components/delete-change-button";
import { DeleteChangeSpecButton } from "../../../components/delete-change-spec-button";
import { InlineFieldEditor } from "../../../components/inline-field-editor";
import { Card, EmptyState, StatusBadge } from "../../../components/ui";
import { getRequestMessages } from "../../../lib/locale";

export default async function ChangeDetailsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, messages } = await getRequestMessages();
  const { id } = await params;
  const change = await getChange(id);

  if (!change) {
    return (
      <EmptyState
        title={messages.changeDetails.changeNotFoundTitle}
        description={messages.changeDetails.changeNotFoundDescription}
      />
    );
  }

  const specs = await listSpecsForChange(change._id);
  const review = await getCurrentReviewSessionForChange(change._id);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded bg-[rgba(0,90,130,0.12)] px-2 py-1 font-[family-name:var(--font-mono)] text-xs font-bold text-[var(--tertiary)]">
              {change._id}
            </span>
            <StatusBadge status={change.status} locale={locale} />
            <span className="font-[family-name:var(--font-mono)] text-xs text-slate-500">
              {messages.changeDetails.version} {change.version}
            </span>
          </div>
          <div className="mb-6">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.22em] text-[var(--tertiary)]">
              {messages.layout.navigation.changes}
            </p>
            <div className="mt-2">
              <InlineFieldEditor
                changeId={change._id}
                version={change.version}
                field="title"
                value={change.title}
                placeholder={messages.changeDetails.titlePlaceholder ?? "Change title"}
                emptyDisplay="—"
                labels={{
                  edit: messages.changeDetails.editField,
                  save: messages.changeDetails.saveField,
                  cancel: messages.changeDetails.cancelField,
                  error: messages.changeDetails.updateFieldFailed
                }}
              />
            </div>
            <div className="mt-2 max-w-3xl">
              <InlineFieldEditor
                changeId={change._id}
                version={change.version}
                field="description"
                value={change.description}
                type="textarea"
                placeholder={messages.changeDetails.descriptionPlaceholder ?? "Change description"}
                emptyDisplay={messages.changeDetails.noDescription ?? "No description"}
                labels={{
                  edit: messages.changeDetails.editField,
                  save: messages.changeDetails.saveField,
                  cancel: messages.changeDetails.cancelField,
                  error: messages.changeDetails.updateFieldFailed
                }}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
                {messages.changeDetails.sprintLabel}
              </span>
              <InlineFieldEditor
                changeId={change._id}
                version={change.version}
                field="sprint"
                value={change.sprint ?? null}
                placeholder={messages.changeDetails.sprintPlaceholder}
                emptyDisplay={messages.changeDetails.noSprint}
                labels={{
                  edit: messages.changeDetails.editField,
                  save: messages.changeDetails.saveField,
                  cancel: messages.changeDetails.cancelField,
                  error: messages.changeDetails.updateFieldFailed
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
                {messages.changeDetails.prdLinkLabel}
              </span>
              <InlineFieldEditor
                changeId={change._id}
                version={change.version}
                field="prd_link"
                value={change.prd_link}
                type="url"
                placeholder={messages.changeDetails.prdLinkPlaceholder}
                emptyDisplay={messages.changeDetails.noPrdLink}
                labels={{
                  edit: messages.changeDetails.editField,
                  save: messages.changeDetails.saveField,
                  cancel: messages.changeDetails.cancelField,
                  error: messages.changeDetails.updateFieldFailed
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/ask?q=${encodeURIComponent(`分析 Change ${change._id}「${change.title}」的整体风险和跨 Spec 一致性`)}`}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-[family-name:var(--font-label)] text-sm font-medium text-slate-600 shadow-sm transition hover:border-violet-300 hover:text-violet-700 hover:shadow-md"
          >
            <svg className="h-4 w-4 text-violet-500 transition group-hover:text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            {messages.changeDetails.analyzeChange}
          </Link>
          {change.status === "draft" && (
            <ActionButton
              label={messages.changeDetails.buttons.startReview}
              endpoint={`/api/changes/${change._id}/start-review`}
              body={{}}
              className="rounded-lg bg-gradient-to-br from-[var(--primary)] to-[#656d84] px-5 py-2.5 font-[family-name:var(--font-label)] text-sm font-bold text-white"
              pendingLabel={messages.common.working}
              errorLabel={messages.common.requestFailed}
            />
          )}
          {change.status === "draft" && !(change.review_required ?? true) && (
            <ActionButton
              label={messages.changeDetails.buttons.skipReview}
              endpoint={`/api/changes/${change._id}/skip-review`}
              className="rounded-lg bg-[var(--surface-high)] px-5 py-2.5 font-[family-name:var(--font-label)] text-sm font-medium text-slate-800"
              pendingLabel={messages.common.working}
              errorLabel={messages.common.requestFailed}
            />
          )}
          {(change.status === "in_review" || change.status === "changes_requested") && (
            <ActionButton
              label={messages.changeDetails.buttons.cancelReview}
              endpoint={`/api/changes/${change._id}/cancel-review`}
              className="rounded-lg bg-[var(--surface-high)] px-5 py-2.5 font-[family-name:var(--font-label)] text-sm font-medium text-slate-800"
              pendingLabel={messages.common.working}
              errorLabel={messages.common.requestFailed}
            />
          )}
          {change.status === "changes_requested" && (
            <ActionButton
              label={messages.changeDetails.buttons.restartReview}
              endpoint={`/api/changes/${change._id}/restart-review`}
              className="rounded-lg bg-[var(--surface-high)] px-5 py-2.5 font-[family-name:var(--font-label)] text-sm font-medium text-slate-800"
              pendingLabel={messages.common.working}
              errorLabel={messages.common.requestFailed}
            />
          )}
          {change.status === "in_review" && specs.some((s) => s.new_version_available) && (
            <ActionButton
              label={messages.changeDetails.buttons.restartReview}
              endpoint={`/api/changes/${change._id}/restart-review`}
              className="rounded-lg bg-[var(--surface-high)] px-5 py-2.5 font-[family-name:var(--font-label)] text-sm font-medium text-slate-800"
              pendingLabel={messages.common.working}
              errorLabel={messages.common.requestFailed}
            />
          )}
          {change.status === "in_review" && (
            <ActionButton
              label={messages.changeDetails.buttons.approveChange}
              endpoint={`/api/changes/${change._id}/approve`}
              className="rounded-lg bg-[var(--surface-high)] px-5 py-2.5 font-[family-name:var(--font-label)] text-sm font-medium text-slate-800"
              pendingLabel={messages.common.working}
              errorLabel={messages.common.requestFailed}
            />
          )}
          {change.status === "approved" && (
            <ActionButton
              label={messages.changeDetails.buttons.archiveChange}
              endpoint={`/api/changes/${change._id}/archive`}
              className="rounded-lg bg-[var(--surface-high)] px-5 py-2.5 font-[family-name:var(--font-label)] text-sm font-medium text-slate-800"
              pendingLabel={messages.common.working}
              errorLabel={messages.common.requestFailed}
            />
          )}
          {(change.status === "draft" || change.status === "archived") && (
            <DeleteChangeButton
              changeId={change._id}
              labels={{
                deleteChange: messages.changeDetails.deleteChange,
                confirmTitle: messages.changeDetails.confirmDeleteTitle,
                confirmMessage: messages.changeDetails.confirmDeleteMessage,
                confirm: messages.changeDetails.confirmDeleteConfirm,
                cancel: messages.changeDetails.confirmDeleteCancel,
                success: messages.changeDetails.deleteSuccess,
                error: messages.changeDetails.deleteFailed
              }}
            />
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="bg-[var(--surface-low)]">
            <ChangeBindingsEditor
              changeId={change._id}
              version={change.version}
              bindings={change.repo_changes}
              labels={{
                title: messages.changeDetails.linkedAssets,
                edit: messages.changeDetails.editLinks,
                save: messages.changeDetails.saveLinks,
                cancel: messages.changeDetails.cancelEdit,
                synced: messages.changeDetails.synced,
                error: messages.changeDetails.updateLinksFailed,
                remove: messages.changeDetails.removeBinding,
                addRepo: messages.changeDetails.addRepoBinding,
                addUrl: messages.changeDetails.addUrlLink,
                repoPlaceholder: messages.changeDetails.repoPlaceholder,
                branchPlaceholder: messages.changeDetails.branchPlaceholder,
                changeNamePlaceholder: messages.changeDetails.changeNamePlaceholder,
                urlPlaceholder: messages.changeDetails.urlPlaceholder,
                urlLabelPlaceholder: messages.changeDetails.urlLabelPlaceholder,
                emptyHint: messages.changeDetails.emptyBindingsHint
              }}
            />
          </Card>

          <Card className="bg-[var(--surface-card)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-slate-900">
                {messages.changeDetails.linkedSpecs}
              </h2>
              {review ? (
                <Link
                  href={`/reviews/${review._id}`}
                  className="font-[family-name:var(--font-label)] text-sm font-medium text-[var(--tertiary)]"
                >
                  {messages.changeDetails.openWorkspace}
                </Link>
              ) : null}
            </div>
            <div className="mt-5 space-y-1">
              {specs.map((spec) => (
                <div key={spec._id} className="flex items-center gap-3 rounded-lg bg-[var(--surface-low)] transition-colors hover:bg-[var(--surface-high)]">
                  <Link
                    href={`/docs/specs/${spec._id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
                    title={`${spec.capability}\n${spec.repo} · ${spec.path}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                      {spec.capability}
                    </span>
                    <span className="shrink-0 font-[family-name:var(--font-mono)] text-[11px] text-slate-400">
                      {spec.repo}
                    </span>
                    <StatusBadge status={spec.review_status ?? "baseline"} locale={locale} />
                  </Link>
                  <div className="shrink-0 pr-2">
                    <DeleteChangeSpecButton
                      changeId={change._id}
                      specId={spec._id}
                      labels={{
                        deleteSpec: messages.changeDetails.deleteSpec,
                        confirmMessage: messages.changeDetails.confirmDeleteSpecMessage,
                        confirm: messages.changeDetails.confirmDeleteSpecConfirm,
                        cancel: messages.changeDetails.confirmDeleteSpecCancel,
                        error: messages.changeDetails.deleteSpecFailed
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="bg-[var(--surface-low)]">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {messages.changeDetails.reviewSession}
            </p>
            {review ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-[var(--surface-card)] px-4 py-4">
                  <p className="font-[family-name:var(--font-mono)] text-xs text-slate-500">{review._id}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {messages.changeDetails.status}: {review.status}
                  </p>
                </div>
                {review.reviewers.map((reviewer) => (
                  <div key={reviewer.user} className="rounded-lg bg-[var(--surface-card)] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{reviewer.user}</p>
                        <p className="text-sm text-slate-500">{reviewer.role}</p>
                      </div>
                      <StatusBadge status={reviewer.status} locale={locale} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-[var(--surface-card)] px-4 py-4 text-sm text-slate-600">
                {messages.changeDetails.noSession}
              </div>
            )}
          </Card>

          <Card className="bg-[#13232d] text-white">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-white/45">
              Review Summary
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg bg-white/8 px-4 py-4">
                <p className="text-sm text-white/65">{messages.changeDetails.linkedSpecs}</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-white">
                  {specs.length}
                </p>
              </div>
              <div className="rounded-lg bg-white/8 px-4 py-4">
                <p className="text-sm text-white/65">Repo Bindings</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-white">
                  {change.repo_changes.length}
                </p>
              </div>
            </div>
          </Card>

          {(change.status === "approved" || change.status === "archived") && (
            <Card className="bg-[var(--primary)] text-white">
              <p className="text-sm leading-6 text-white/85">{messages.changeDetails.archiveFollowUp}</p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
