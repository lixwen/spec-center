import Link from "next/link";
import { searchCenter } from "@spec-center/core";
import { NoProjectAccess } from "../../components/no-project-access";
import { EmptyState, SectionHeading } from "../../components/ui";
import { getRequestMessages } from "../../lib/locale";
import { getProjectContext } from "../../lib/project";
import { requireCurrentUser } from "../../lib/session";

export default async function SearchPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const { messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { activeProject } = await getProjectContext(currentUser);

  if (!activeProject) {
    return <NoProjectAccess messages={messages.noProject} />;
  }

  const query = searchParams ? (await searchParams)?.q?.trim() ?? "" : "";
  const results = await searchCenter(query, activeProject._id);

  const groups = {
    change: results.filter((item) => item.kind === "change"),
    product_spec: results.filter((item) => item.kind === "product_spec"),
    review_session: results.filter((item) => item.kind === "review_session")
  };

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={messages.search.eyebrow}
        title={query ? `${messages.search.title} · ${query}` : messages.search.title}
        description={messages.search.description}
      />

      {results.length === 0 ? (
        <EmptyState
          title={messages.search.emptyTitle}
          description={messages.search.emptyDescription}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <SearchColumn title={messages.search.changes} items={groups.change} />
          <SearchColumn title={messages.search.productSpecs} items={groups.product_spec} />
          <SearchColumn title={messages.search.reviewSessions} items={groups.review_session} />
        </div>
      )}
    </div>
  );
}

function SearchColumn({
  title,
  items
}: {
  title: string;
  items: Array<{ id: string; title: string; subtitle: string; href: string; matchSnippet?: string }>;
}) {
  return (
    <section className="rounded-lg bg-[var(--surface-card)] p-5">
      <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="block rounded-lg bg-[var(--surface-low)] px-4 py-4 transition hover:bg-[var(--surface-high)]"
          >
            <p className="font-medium text-slate-900">{item.title}</p>
            <p className="mt-1 text-sm text-slate-500">{item.subtitle}</p>
            {item.matchSnippet && (
              <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.matchSnippet}</p>
            )}
          </Link>
        ))}
        {items.length === 0 ? (
          <div className="rounded-lg bg-[var(--surface-low)] px-4 py-4 text-sm text-slate-500">
            0
          </div>
        ) : null}
      </div>
    </section>
  );
}
