import Link from "next/link";
import { getProductKnowledge, listProductSpecs } from "@spec-center/core";
import { NoProjectAccess } from "../../components/no-project-access";
import { ProductSpecBrowserClient } from "../../components/product-spec-browser-client";
import { SectionHeading } from "../../components/ui";
import { getRequestMessages } from "../../lib/locale";
import { getProjectContext } from "../../lib/project";
import { requireCurrentUser } from "../../lib/session";

export default async function ProductSpecsPage({
  searchParams
}: {
  searchParams?: Promise<{ spec?: string }>;
}) {
  const { messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { activeProject } = await getProjectContext(currentUser);

  if (!activeProject) {
    return <NoProjectAccess messages={messages.noProject} />;
  }

  const specs = await listProductSpecs(activeProject._id);
  const query = searchParams ? await searchParams : {};
  const active = specs.find((spec) => spec._id === query?.spec) ?? specs[0];
  const knowledgeEntries = await Promise.all(
    specs.map(async (spec) => {
      const knowledge = await getProductKnowledge(spec._id, currentUser);
      return [
        spec._id,
        {
          spec: {
            _id: knowledge.spec._id,
            capability: knowledge.spec.capability,
            repo: knowledge.spec.repo,
            path: knowledge.spec.path,
            historyCount: knowledge.history.length
          },
          snapshots: knowledge.snapshots.map((snapshot) => ({
            _id: snapshot._id,
            created_at: snapshot.created_at,
            content: snapshot.content
          })),
          history: knowledge.history.map((entry) => ({
            change_id: entry.change_id,
            title: entry.title,
            note: entry.note
          }))
        }
      ] as const;
    })
  );
  const knowledgeById = Object.fromEntries(knowledgeEntries);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <SectionHeading
          eyebrow={messages.productSpecs.eyebrow}
          title={messages.productSpecs.title}
          description={messages.productSpecs.description}
        />
      </section>
      <ProductSpecBrowserClient
        specs={specs.map((spec) => ({
          _id: spec._id,
          capability: spec.capability,
          repo: spec.repo,
          path: spec.path,
          historyCount: knowledgeById[spec._id].history.length
        }))}
        initialSpecId={active?._id ?? specs[0]?._id ?? ""}
        knowledgeById={knowledgeById}
        messages={{
          filterPlaceholder: messages.productSpecs.filterPlaceholder,
          activeLabel: messages.productSpecs.activeLabel,
          totalSuffix: messages.common.totalSuffix,
          openBaseline: messages.productSpecs.openBaseline,
          baselineEyebrow: messages.productSpecs.baselineEyebrow,
          noBaselineContent: messages.productSpecs.noBaselineContent,
          evolutionTitle: messages.productSpecs.evolutionTitle,
          evolutionDescription: messages.productSpecs.evolutionDescription,
          historyEntries: messages.common.historyEntries,
          snapshots: messages.common.snapshots,
          snapshotHistory: messages.productSpecs.snapshotHistory,
          historyCountSuffix: messages.productSpecs.historyCountSuffix
        }}
      />
    </div>
  );
}
