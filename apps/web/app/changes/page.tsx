import Link from "next/link";
import {
  getChangeDashboardEntries,
  getChangeDashboardSummary
} from "@spec-center/core";
import { ChangeCreatePanel } from "../../components/change-create-panel";
import { ChangesDashboardClient } from "../../components/changes-dashboard-client";
import { NoProjectAccess } from "../../components/no-project-access";
import { SectionHeading } from "../../components/ui";
import { getRequestMessages } from "../../lib/locale";
import { getProjectContext } from "../../lib/project";
import { requireCurrentUser } from "../../lib/session";

export default async function ChangesPage() {
  const { locale, messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { activeProject } = await getProjectContext(currentUser);

  if (!activeProject) {
    return <NoProjectAccess messages={messages.noProject} />;
  }

  const summary = await getChangeDashboardSummary(activeProject._id);
  const entries = await getChangeDashboardEntries(activeProject._id);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <SectionHeading
          eyebrow={messages.changes.eyebrow}
          title={messages.changes.title}
          description={messages.changes.description}
        />
        <ChangeCreatePanel
          currentUser={currentUser.username}
          currentProjectId={activeProject._id}
          ctaLabel={messages.changes.createChange}
          submitLabel={messages.changes.submitChange}
          cancelLabel={messages.changes.cancelCreate}
          pendingLabel={messages.common.working}
          errorLabel={messages.changes.createFailed}
          labels={messages.changes.createPanel}
        />
      </section>

      <ChangesDashboardClient
        entries={entries}
        summary={summary}
        locale={locale}
        messages={{
          common: { noValue: messages.common.noValue },
          changes: {
            metrics: messages.changes.metrics,
            reviewIntent: messages.changes.reviewIntent,
            readyToArchive: messages.changes.readyToArchive,
            blockers: messages.changes.blockers,
            clearPath: messages.changes.clearPath,
            operatorSignals: messages.changes.operatorSignals,
            reviewerSignals: messages.changes.reviewerSignals,
            noBlockers: messages.changes.noBlockers,
            sprintAll: messages.changes.sprintAll,
            sprintNone: messages.changes.sprintNone,
            sprintColumn: messages.changes.sprintColumn,
            dataBlocks: {
              never: messages.changes.dataBlocks.never,
              driftAlerts: messages.changes.dataBlocks.driftAlerts,
              noNewerSnapshots: messages.changes.dataBlocks.noNewerSnapshots
            }
          }
        }}
      />
    </div>
  );
}
