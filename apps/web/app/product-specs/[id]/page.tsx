import Link from "next/link";
import { getProductKnowledge } from "@spec-center/core";
import { DeleteProductSpecButton } from "../../../components/delete-product-spec-button";
import { MarkdownFullscreenButton, MarkdownViewer } from "../../../components/markdown-viewer";
import { Card, EmptyState, SectionHeading, StatusBadge } from "../../../components/ui";
import { getRequestMessages } from "../../../lib/locale";
import { requireCurrentUser } from "../../../lib/session";

export default async function ProductSpecDetailsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { id } = await params;
  const knowledge = await (async () => {
    try {
      return await getProductKnowledge(id, currentUser);
    } catch {
      return null;
    }
  })();

  if (!knowledge) {
    return (
      <EmptyState
        title={messages.productSpecs.notFoundTitle}
        description={messages.productSpecs.notFoundDescription}
      />
    );
  }

  const { spec, history, snapshots } = knowledge;
  const current = snapshots[0];

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <SectionHeading
          eyebrow={messages.productSpecs.baselineEyebrow}
          title={spec.capability}
          description={spec.path}
        />
        <div className="flex items-center gap-3">
          <DeleteProductSpecButton
            specId={spec._id}
            labels={{
              deleteSpec: messages.productSpecs.deleteSpec,
              confirmTitle: messages.productSpecs.confirmDeleteTitle,
              confirmMessage: messages.productSpecs.confirmDeleteMessage,
              confirm: messages.productSpecs.confirmDelete,
              cancel: messages.productSpecs.cancelDelete,
              error: messages.productSpecs.deleteError
            }}
          />
          <Link
            href="/product-specs"
            className="inline-flex rounded-lg bg-[var(--surface-low)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-[var(--surface-high)]"
          >
            {messages.productSpecs.openChangeDashboard}
          </Link>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="bg-[var(--surface-card)]">
          {current ? (
            <>
              <div className="mb-4 flex justify-end">
                <MarkdownFullscreenButton content={current.content} />
              </div>
              <MarkdownViewer content={current.content} />
            </>
          ) : (
            <p>{messages.productSpecs.noBaselineContent}</p>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="bg-[#13232d] text-white">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em]">
              {messages.productSpecs.evolutionTitle}
            </h3>
            <p className="mt-3 text-sm leading-6 text-white/72">{messages.productSpecs.evolutionDescription}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white/8 px-4 py-4">
                <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-white/45">
                  {messages.common.historyEntries}
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold">{history.length}</p>
              </div>
              <div className="rounded-lg bg-white/8 px-4 py-4">
                <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-white/45">
                  {messages.common.snapshots}
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold">{snapshots.length}</p>
              </div>
            </div>
          </Card>

          <Card className="bg-[var(--surface-low)]">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-slate-900">
              {messages.productSpecs.snapshotHistory}
            </h3>
            <div className="mt-4 space-y-3">
              {snapshots.map((snapshot) => (
                <div key={snapshot._id} className="rounded-lg bg-[var(--surface-card)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-[family-name:var(--font-mono)] text-xs text-slate-500">{snapshot._id}</p>
                    <StatusBadge status={snapshot.type} locale={locale} />
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{snapshot.created_at}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-[var(--surface-low)]">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em] text-slate-900">
              {messages.productSpecs.capabilityHistory}
            </h3>
            <div className="mt-4 space-y-3">
              {history.map((change) => (
                <Link
                  key={change.change_id}
                  href={`/changes/${change.change_id}`}
                  className="block rounded-lg bg-[var(--surface-card)] px-4 py-4 transition-colors hover:bg-[var(--surface-high)]"
                >
                  <p className="font-[family-name:var(--font-mono)] text-xs text-slate-500">{change.change_id}</p>
                  <p className="mt-2 font-medium text-slate-900">{change.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{change.note}</p>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
