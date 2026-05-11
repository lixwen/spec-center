import { getActiveProject, listProjectCatalog, type AuthenticatedUser } from "@spec-center/core";
import { cookies } from "next/headers";
import type { Project } from "@spec-center/core";

export const projectCookieName = "sc-project";

export function selectAccessibleProject(projects: Project[], projectId?: string) {
  return projects.find((project) => project._id === projectId) ?? projects[0];
}

export async function getProjectContext(actor?: AuthenticatedUser): Promise<{
  projects: Project[];
  activeProject: Project | null;
}> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(projectCookieName)?.value;
  const projects = await listProjectCatalog(actor);
  const activeProject = actor
    ? selectAccessibleProject(projects, saved) ?? null
    : (await getActiveProject(saved)) ?? null;

  return {
    projects,
    activeProject
  };
}

export async function getActiveProjectId(actor?: AuthenticatedUser): Promise<string | null> {
  const { activeProject } = await getProjectContext(actor);
  return activeProject?._id ?? null;
}
