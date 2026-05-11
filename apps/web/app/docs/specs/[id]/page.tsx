import Link from "next/link";
import { getProductKnowledge, getSnapshot, getSpec } from "@spec-center/core";
import { MarkdownFullscreenButton, MarkdownViewer } from "../../../../components/markdown-viewer";
import { Card, EmptyState, SectionHeading, StatusBadge } from "../../../../components/ui";
import { getRequestMessages } from "../../../../lib/locale";
import { requireCurrentUser } from "../../../../lib/session";

export default async function SpecDocumentPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { id } = await params;
  const spec = await getSpec(id);

  if (!spec) {
    return (
      <EmptyState
        title={messages.specDocs.notFoundTitle}
        description={messages.specDocs.notFoundDescription}
      />
    );
  }

  if (!spec.working_snapshot_id) {
    return (
      <EmptyState
        title={messages.specDocs.noContentTitle}
        description={messages.specDocs.noContentDescription}
      />
    );
  }

  const snapshot = await getSnapshot(spec.working_snapshot_id);
  const productKnowledge =
    spec.scope === "product" ? await getProductKnowledge(spec._id, currentUser) : null;
  const backHref =
    spec.scope === "product"
      ? `/product-specs/${spec._id}`
      : spec.change_id
        ? `/changes/${spec.change_id}`
        : "/changes";

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <SectionHeading
          eyebrow={messages.specDocs.eyebrow}
          title={spec.capability}
          description={spec.path}
        />
        <div className="flex items-center gap-3">
          <Link
            href={`/ask?q=${encodeURIComponent(`分析 Spec「${spec.capability}」(${spec._id}) 的质量问题和评审要点`)}`}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-violet-300 hover:text-violet-700 hover:shadow-md"
          >
            <svg className="h-4 w-4 text-violet-500 transition group-hover:text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            {messages.specDocs.analyzeSpec}
          </Link>
          <Link
            href={backHref}
            className="inline-flex rounded-lg bg-[var(--surface-low)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-[var(--surface-high)]"
          >
            {messages.specDocs.back}
          </Link>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="bg-[var(--surface-card)]">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <StatusBadge status={spec.review_status ?? "baseline"} locale={locale} />
            <span className="rounded-full bg-[var(--surface-low)] px-3 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
              {spec.scope === "product"
                ? messages.specDocs.productSpec
                : messages.specDocs.changeSpec}
            </span>
            <span className="ml-auto">
              <MarkdownFullscreenButton content={snapshot?.content ?? messages.specDocs.noContentDescription} />
            </span>
          </div>
          <MarkdownViewer content={snapshot?.content ?? messages.specDocs.noContentDescription} />
        </Card>

        <div className="space-y-6">
          <Card className="bg-[var(--surface-low)]">
            <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {messages.specDocs.meta}
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg bg-[var(--surface-card)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{messages.specDocs.scope}</p>
                <p className="mt-2 font-medium text-slate-900">{spec.scope}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-card)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{messages.specDocs.repo}</p>
                <p className="mt-2 font-medium text-slate-900">
                  {spec.repo} · {spec.branch}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--surface-card)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{messages.specDocs.snapshot}</p>
                <p className="mt-2 font-[family-name:var(--font-mono)] text-xs text-slate-700">
                  {snapshot?._id ?? messages.common.noValue}
                </p>
              </div>
            </div>
          </Card>

          {productKnowledge ? (
            <Card className="bg-[#13232d] text-white">
              <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-white/45">
                {messages.specDocs.history}
              </p>
              <div className="mt-4 space-y-3">
                {productKnowledge.history.slice(0, 6).map((entry) => (
                  <div key={entry.change_id} className="rounded-lg bg-white/8 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-[family-name:var(--font-mono)] text-xs text-white/55">
                        {entry.change_id}
                      </p>
                      <StatusBadge status={entry.status} locale={locale} />
                    </div>
                    <p className="mt-2 font-medium text-white">{entry.title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/72">{entry.note}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
