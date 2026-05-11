import Link from "next/link";
import { getOverviewMetrics, listChanges, listProductSpecs } from "@spec-center/core";
import { NoProjectAccess } from "../components/no-project-access";
import { Card, SectionHeading, Stat, StatusBadge } from "../components/ui";
import { getRequestMessages } from "../lib/locale";
import { getProjectContext } from "../lib/project";
import { requireCurrentUser } from "../lib/session";

export default async function HomePage() {
  const { locale, messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { activeProject } = await getProjectContext(currentUser);

  if (!activeProject) {
    return <NoProjectAccess messages={messages.noProject} />;
  }

  const metrics = await getOverviewMetrics(activeProject._id);
  const changes = (await listChanges(activeProject._id)).slice(0, 4);
  const productSpecs = (await listProductSpecs(activeProject._id)).slice(0, 4);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={messages.home.eyebrow}
        title={messages.home.title}
        description={messages.home.description}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Stat label={messages.home.stats.totalChanges} value={metrics.totalChanges} href="/changes" />
        <Stat label={messages.home.stats.reviewQueue} value={metrics.reviewQueue} href="/changes" />
        <Stat label={messages.home.stats.productSpecs} value={metrics.productSpecs} href="/product-specs" />
        <Stat label={messages.home.stats.openComments} value={metrics.openComments} href="/tasks" />
        <Stat label={messages.home.stats.readyToArchive} value={metrics.readyToArchive} href="/changes" />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="bg-[var(--surface-card)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-[var(--tertiary)]">
                {messages.home.changesEyebrow}
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-slate-900">
                {messages.home.changesTitle}
              </h2>
            </div>
            <Link href="/changes" className="font-[family-name:var(--font-label)] text-sm text-slate-500">
              {messages.common.viewAll}
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {changes.map((change) => (
              <Link
                key={change._id}
                href={`/changes/${change._id}`}
                className="block rounded-lg bg-[var(--surface-low)] px-4 py-4 transition hover:bg-[var(--surface-high)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-[family-name:var(--font-mono)] text-xs text-slate-500">{change._id}</p>
                    <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.03em] text-slate-900">
                      {change.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{change.description}</p>
                  </div>
                  <StatusBadge status={change.status} locale={locale} />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="bg-[var(--surface-low)]">
          <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-[var(--tertiary)]">
            {messages.home.productEyebrow}
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-slate-900">
            {messages.home.productTitle}
          </h2>
          <div className="mt-5 space-y-3">
            {productSpecs.map((spec) => (
              <Link
                key={spec._id}
                href={`/product-specs/${spec._id}`}
                className="block rounded-lg bg-[var(--surface-card)] px-4 py-4 transition hover:bg-white"
              >
                <p className="font-[family-name:var(--font-mono)] text-[10px] text-slate-500">{spec.repo}</p>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg font-bold tracking-[-0.02em] text-slate-900">
                  {spec.capability}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{spec.path}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
