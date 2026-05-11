import Link from "next/link";
import { getReviewerTasks, getReviewSession, type SpecReviewRecord } from "@spec-center/core";
import { NoProjectAccess } from "../../components/no-project-access";
import { Card, SectionHeading, StatusBadge } from "../../components/ui";
import { getRequestMessages } from "../../lib/locale";
import { getProjectContext } from "../../lib/project";
import { requireCurrentUser } from "../../lib/session";

export default async function TasksPage() {
  const { locale, messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { activeProject } = await getProjectContext(currentUser);

  if (!activeProject) {
    return <NoProjectAccess messages={messages.noProject} />;
  }

  const tasks = await getReviewerTasks(currentUser.username, activeProject._id, currentUser);
  const sessionsMap = new Map<string, SpecReviewRecord[]>();
  for (const task of tasks) {
    const session = await getReviewSession(task.sessionId, currentUser);
    sessionsMap.set(task.sessionId, session?.spec_reviews ?? []);
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={messages.tasks.eyebrow}
        title={`${messages.tasks.title} · @${currentUser.username}`}
        description={messages.tasks.description}
      />

      <div className="space-y-5">
        {tasks.map((task) => (
          <Card key={task.sessionId} className="bg-[var(--surface-card)]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="font-[family-name:var(--font-mono)] text-xs text-slate-500">{task.sessionId}</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-slate-900">
                  {task.change?.title ?? messages.tasks.unknownChange}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {task.specs.length} {messages.tasks.assignedSpecs} · {task.openComments} {messages.tasks.openComments}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={task.reviewer.status} locale={locale} />
                <Link
                  href={`/reviews/${task.sessionId}`}
                  className="rounded-lg bg-gradient-to-br from-[var(--primary)] to-[#656d84] px-4 py-2.5 font-[family-name:var(--font-label)] text-sm font-bold text-white"
                >
                  {messages.tasks.openWorkspace}
                </Link>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {task.specs.map((spec) => {
                const specReviews = (sessionsMap.get(task.sessionId) ?? []).filter(
                  (r) => r.spec_id === spec._id
                );
                const approvedCount = specReviews.filter((r) => r.status === "approved").length;
                return (
                  <Link
                    key={spec._id}
                    href={`/reviews/${task.sessionId}?spec=${spec._id}`}
                    className="block rounded-lg bg-[var(--surface-low)] px-4 py-4 transition-colors hover:bg-[var(--surface-high)]"
                  >
                    <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {spec.repo}
                    </p>
                    <p className="mt-2 font-medium text-slate-900">{spec.capability}</p>
                    {specReviews.length > 0 && (
                      <p className="mt-2 font-[family-name:var(--font-mono)] text-xs text-slate-500">
                        {approvedCount}/{specReviews.length} {messages.review.approved}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="mt-5 rounded-lg bg-[#13232d] p-4 text-white">
              <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-white/45">
                {messages.tasks.recommendationHints}
              </p>
              <div className="mt-4 space-y-3">
                {task.recommendations.map((item) => (
                  <div key={item.user} className="rounded-lg bg-white/8 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{item.user}</p>
                      <span className="rounded-full bg-white/12 px-3 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em] text-white/80">
                        {Math.round(item.score * 100)} {messages.common.score}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-white/72">{item.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
