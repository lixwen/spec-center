import { getEmbeddingTaskStats, listEmbeddingTasks } from "@spec-center/core";
import { EmbeddingTasksClient } from "../../../components/embedding-tasks-client";
import { SectionHeading } from "../../../components/ui";
import { getRequestMessages } from "../../../lib/locale";
import { getProjectContext } from "../../../lib/project";
import { requirePlatformAdmin } from "../../../lib/session";
import { NoProjectAccess } from "../../../components/no-project-access";

export default async function EmbeddingTasksPage() {
  const { messages } = await getRequestMessages();
  const currentUser = await requirePlatformAdmin();
  const { activeProject } = await getProjectContext(currentUser);

  if (!activeProject) {
    return <NoProjectAccess messages={messages.noProject} />;
  }

  const [stats, list] = await Promise.all([
    getEmbeddingTaskStats(activeProject._id),
    listEmbeddingTasks(activeProject._id, { page: 1, pageSize: 20 })
  ]);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={messages.embeddingTasks.eyebrow}
        title={messages.embeddingTasks.title}
        description={messages.embeddingTasks.description}
      />
      <EmbeddingTasksClient
        initialStats={stats}
        initialItems={JSON.parse(JSON.stringify(list.items))}
        initialTotal={list.total}
        messages={messages.embeddingTasks}
      />
    </div>
  );
}
