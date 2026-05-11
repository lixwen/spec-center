import { getActiveProject, getProjectReviewers, listProjectCatalog, listUsers } from "@spec-center/core";
import { ProjectManagementClient } from "../../../components/project-management-client";
import { SectionHeading } from "../../../components/ui";
import { getRequestMessages } from "../../../lib/locale";
import { requireProjectAdmin } from "../../../lib/session";

export default async function ProjectSettingsPage() {
  const { messages } = await getRequestMessages();
  const currentUser = await requireProjectAdmin();
  const [projects, activeProject] = await Promise.all([
    listProjectCatalog(currentUser),
    getActiveProject().catch(() => null)
  ]);
  const [reviewers, users] = activeProject
    ? await Promise.all([
        getProjectReviewers(activeProject._id, currentUser).catch(() => []),
        listUsers().catch(() => [])
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={messages.settings.projectsEyebrow}
        title={messages.settings.projectsTitle}
        description={messages.settings.projectsDescription}
      />
      <ProjectManagementClient
        projects={projects}
        labels={{
          createProject: messages.settings.createProject,
          saveProject: messages.settings.saveProject,
          setDefault: messages.settings.setDefault,
          defaultProject: messages.settings.defaultProject,
          projectName: messages.settings.projectName,
          projectSlug: messages.settings.projectSlug,
          projectDescription: messages.settings.projectDescription,
          projectRepo: messages.settings.projectRepo,
          projectBranch: messages.settings.projectBranch,
          repoBindings: messages.settings.repoBindings,
          repoBindingsAutoHint: messages.settings.repoBindingsAutoHint,
          projectSaveFailed: messages.settings.projectSaveFailed,
          projectCreated: messages.settings.projectCreated,
          projectSaved: messages.settings.projectSaved,
          projectSetDefault: messages.settings.projectSetDefault,
          projectsCount: messages.settings.projectsCount,
          cancel: messages.settings.cancel,
          validationNameRequired: messages.settings.projectValidationNameRequired,
          validationSlugRequired: messages.settings.projectValidationSlugRequired,
          deleteProject: messages.settings.deleteProject,
          deleteProjectConfirm: messages.settings.deleteProjectConfirm,
          projectDeleted: messages.settings.projectDeleted,
          deleteProjectFailed: messages.settings.deleteProjectFailed
        }}
        reviewerData={activeProject ? {
          activeProjectId: activeProject._id,
          reviewers: reviewers as { user: string; role: string }[],
          users: users.map((u) => ({ username: u.username, display_name: u.display_name })),
          labels: {
            user: messages.settings.reviewerUser,
            role: messages.settings.reviewerRole,
            addReviewer: messages.settings.addReviewer,
            removeReviewer: messages.settings.removeReviewer,
            save: messages.settings.saveReviewers,
            saveFailed: messages.settings.saveReviewersFailed,
            selectUser: messages.settings.selectUser,
            tabSettings: messages.settings.tabSettings,
            tabReviewers: messages.settings.tabReviewers
          }
        } : undefined}
      />
    </div>
  );
}
