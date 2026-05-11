import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, Project } from "../packages/core/src/domain/models";

const { cookieGet, listProjectCatalog, getActiveProject } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  listProjectCatalog: vi.fn(),
  getActiveProject: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookieGet
  }))
}));

vi.mock("@spec-center/core", () => ({
  listProjectCatalog,
  getActiveProject
}));

import { getProjectContext, projectCookieName } from "../apps/web/lib/project";

function createProject(project: Partial<Project> & Pick<Project, "_id" | "name" | "slug">): Project {
  return {
    description: null,
    repo_bindings: [],
    is_default: false,
    ...project
  };
}

function createActor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    user_id: "user-1",
    email: "accept@example.com",
    display_name: "Acceptance User",
    global_roles: [],
    memberships: [
      {
        project_id: "project-default",
        role: "reviewer"
      }
    ],
    token_version: 1,
    status: "active",
    ...overrides
  };
}

describe("project context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the first accessible project when the cookie points to an unauthorized project", async () => {
    const defaultProject = createProject({
      _id: "project-default",
      name: "Project Alpha",
      slug: "alpha",
      is_default: true
    });

    cookieGet.mockReturnValue({ name: projectCookieName, value: "project-orbit" });
    listProjectCatalog.mockResolvedValue([defaultProject]);

    const context = await getProjectContext(createActor());

    expect(context.projects).toEqual([defaultProject]);
    expect(context.activeProject).toEqual(defaultProject);
    expect(getActiveProject).not.toHaveBeenCalled();
  });

  it("uses the saved project for anonymous context resolution", async () => {
    const orbitProject = createProject({
      _id: "project-orbit",
      name: "Project Orbit",
      slug: "orbit"
    });

    cookieGet.mockReturnValue({ name: projectCookieName, value: "project-orbit" });
    listProjectCatalog.mockResolvedValue([
      createProject({
        _id: "project-default",
        name: "Project Alpha",
        slug: "alpha",
        is_default: true
      })
    ]);
    getActiveProject.mockResolvedValue(orbitProject);

    const context = await getProjectContext();

    expect(context.activeProject).toEqual(orbitProject);
    expect(getActiveProject).toHaveBeenCalledWith("project-orbit");
  });
});
