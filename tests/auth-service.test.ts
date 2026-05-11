import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearMongoDatabase, closeMongoConnection, getMongoCollections } from "../packages/core/src/data/mongo";
import { seedDemoData } from "../packages/core/src/data/mongo-seed";
import {
  authenticateUser,
  createUser,
  ensureBootstrapAdmin,
  getAuthenticatedUserFromToken,
  migrateUsersWithoutUsername,
  registerUser,
  updateUser
} from "../packages/core/src/services/auth-service";
import {
  createProject,
  createComment,
  getReviewerTasks,
  listProjectCatalog,
  startReview,
  syncUpload,
  updateChange,
  updateComment
} from "../packages/core/src/services/center-service";
import { sha256 } from "../packages/core/src/utils/hash";

describe.sequential("auth service", () => {
  beforeEach(async () => {
    await seedDemoData();
    delete process.env.OPENSPEC_BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.OPENSPEC_BOOTSTRAP_ADMIN_PASSWORD;
    delete process.env.OPENSPEC_BOOTSTRAP_ADMIN_NAME;
    delete process.env.OPENSPEC_BOOTSTRAP_ADMIN_USERNAME;
  });

  afterAll(async () => {
    await closeMongoConnection();
  });

  it("authenticates a local user by username and resolves token claims", async () => {
    const session = await authenticateUser("admin", "password123");
    const actor = await getAuthenticatedUserFromToken(session.token);

    expect(session.user.username).toBe("admin");
    expect(actor.username).toBe("admin");
    expect(actor.global_roles).toContain("platform_admin");
  });

  it("rejects disabled users and invalid credentials", async () => {
    await expect(authenticateUser("admin", "wrong-password")).rejects.toThrow(
      /invalid credentials/i
    );

    const locked = await createUser({
      username: "locked",
      email: "locked@example.com",
      display_name: "Locked User",
      password: "password123"
    });
    await updateUser(locked._id, { status: "disabled" });

    await expect(authenticateUser("locked", "password123")).rejects.toThrow(
      /invalid credentials/i
    );
  });

  it("invalidates older tokens after user security state changes", async () => {
    const created = await createUser({
      username: "rotate",
      email: "rotate@example.com",
      display_name: "Rotate Me",
      password: "password123"
    });
    const session = await authenticateUser("rotate", "password123");

    await updateUser(created._id, { status: "disabled" });

    await expect(getAuthenticatedUserFromToken(session.token)).rejects.toThrow(
      /authenticated user is unavailable|no longer valid/i
    );
  });

  it("creates a bootstrap admin only when the user table is empty", async () => {
    await clearMongoDatabase();
    process.env.OPENSPEC_BOOTSTRAP_ADMIN_USERNAME = "bootstrap";
    process.env.OPENSPEC_BOOTSTRAP_ADMIN_EMAIL = "bootstrap@example.com";
    process.env.OPENSPEC_BOOTSTRAP_ADMIN_PASSWORD = "password123";
    process.env.OPENSPEC_BOOTSTRAP_ADMIN_NAME = "Bootstrap Admin";

    await ensureBootstrapAdmin();
    await ensureBootstrapAdmin();

    const collections = await getMongoCollections();
    const users = await collections.users.find().toArray();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe("bootstrap");
    expect(users[0].email).toBe("bootstrap@example.com");
    expect(users[0].global_roles).toEqual(["platform_admin"]);
  });

  it("derives bootstrap username from email when OPENSPEC_BOOTSTRAP_ADMIN_USERNAME is not set", async () => {
    await clearMongoDatabase();
    process.env.OPENSPEC_BOOTSTRAP_ADMIN_EMAIL = "superadmin@example.com";
    process.env.OPENSPEC_BOOTSTRAP_ADMIN_PASSWORD = "password123";

    await ensureBootstrapAdmin();

    const collections = await getMongoCollections();
    const users = await collections.users.find().toArray();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe("superadmin");
  });

  it("registers a new user with username and returns JWT", async () => {
    const { user, token } = await registerUser({
      username: "newuser",
      password: "securepass123",
      display_name: "New User"
    });

    expect(user.username).toBe("newuser");
    expect(user._id).toBe("user-newuser");
    expect(token).toBeTruthy();

    const actor = await getAuthenticatedUserFromToken(token);
    expect(actor.username).toBe("newuser");
    expect(actor.global_roles).toEqual([]);
  });

  it("registers a user with optional email", async () => {
    const { user } = await registerUser({
      username: "emailuser",
      password: "securepass123",
      display_name: "Email User",
      email: "emailuser@example.com"
    });

    expect(user.username).toBe("emailuser");
    expect(user.email).toBe("emailuser@example.com");
  });

  it("rejects registration with duplicate username", async () => {
    await expect(
      registerUser({
        username: "admin",
        password: "securepass123",
        display_name: "Duplicate"
      })
    ).rejects.toThrow(/already taken/i);
  });

  it("rejects registration with duplicate email", async () => {
    await expect(
      registerUser({
        username: "newuser2",
        password: "securepass123",
        display_name: "Dup Email",
        email: "admin@example.com"
      })
    ).rejects.toThrow(/already in use/i);
  });

  it("authenticates with case-insensitive username", async () => {
    const session = await authenticateUser("Admin", "password123");
    expect(session.user.username).toBe("admin");
  });

  it("migrates users without username from email", async () => {
    const collections = await getMongoCollections();
    await collections.users.insertOne({
      _id: "user-legacy",
      email: "legacy@example.com",
      display_name: "Legacy User",
      password_hash: "scrypt:test:test",
      global_roles: [],
      memberships: [],
      status: "active",
      token_version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    } as any);

    await migrateUsersWithoutUsername();

    const migrated = await collections.users.findOne({ _id: "user-legacy" });
    expect(migrated?.username).toBe("legacy");
  });

  it("handles username conflict during migration by appending suffix", async () => {
    const collections = await getMongoCollections();
    await collections.users.insertOne({
      _id: "user-legacy-admin",
      email: "admin@other.com",
      display_name: "Legacy Admin",
      password_hash: "scrypt:test:test",
      global_roles: [],
      memberships: [],
      status: "active",
      token_version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    } as any);

    await migrateUsersWithoutUsername();

    const migrated = await collections.users.findOne({ _id: "user-legacy-admin" });
    expect(migrated?.username).toBe("admin-1");
  });

  it("enforces RBAC for project management and review access", async () => {
    const reviewer = await getAuthenticatedUserFromToken(
      (await authenticateUser("qa", "password123")).token
    );
    const pm = await getAuthenticatedUserFromToken(
      (await authenticateUser("pm", "password123")).token
    );

    await expect(
      createProject({
        actor: reviewer,
        slug: "forbidden",
        name: "Forbidden"
      })
    ).rejects.toThrow(/platform administrators/i);

    await syncUpload({
      scope: "change",
      change_id: "CHG-2026-00124",
      capability: "task-list-review",
      repo: "spec-center",
      branch: "feature/task-list",
      change_name: "task-list-refine",
      path: "openspec/changes/task-list-refine/specs/task-list-review/spec.md",
      type: "API",
      content: "# Task list review",
      content_hash: sha256("# Task list review"),
      commit_sha: "def456",
      collected_at: "2026-04-01T12:00:00Z"
    });

    const session = await startReview(
      "CHG-2026-00124",
      [{ user: "qa", role: "QA", assigned_specs: [] }],
      pm
    );

    await expect(getReviewerTasks("qa", "project-default", pm)).rejects.toThrow(
      /authenticated user/i
    );

    await expect(
      createComment({
        actor: pm,
        sessionId: session._id,
        specId: session.baselines[0].spec_id,
        author: "pm",
        content: "PM cannot act as reviewer comment author here without review access mismatch.",
        anchor: {
          type: "heading",
          heading_path: "## Notes",
          line_hint: 1
        }
      })
    ).resolves.toBeTruthy();
  });

  it("rejects updateChange when actor lacks project role", async () => {
    const reviewer = await getAuthenticatedUserFromToken(
      (await authenticateUser("qa", "password123")).token
    );

    await expect(
      updateChange("CHG-2026-00124", { title: "Hijacked title" }, reviewer)
    ).rejects.toThrow(/cannot advance/i);
  });

  it("allows updateChange when actor has pm role", async () => {
    const pm = await getAuthenticatedUserFromToken(
      (await authenticateUser("pm", "password123")).token
    );

    const updated = await updateChange("CHG-2026-00124", { description: "Updated by PM" }, pm);
    expect(updated.description).toBe("Updated by PM");
  });

  it("rejects updateComment when actor is not author and lacks project role", async () => {
    const pm = await getAuthenticatedUserFromToken(
      (await authenticateUser("pm", "password123")).token
    );

    await syncUpload({
      scope: "change",
      change_id: "CHG-2026-00124",
      capability: "rbac-test",
      repo: "spec-center",
      branch: "feature/rbac",
      change_name: "rbac-test",
      path: "openspec/changes/rbac-test/specs/rbac-test/spec.md",
      content: "# RBAC test",
      content_hash: sha256("# RBAC test"),
      commit_sha: "abc789",
      collected_at: "2026-04-01T12:00:00Z"
    });

    const session = await startReview(
      "CHG-2026-00124",
      [{ user: "qa", role: "QA", assigned_specs: [] }],
      pm
    );

    const comment = await createComment({
      actor: pm,
      sessionId: session._id,
      specId: session.baselines[0].spec_id,
      author: "pm",
      content: "Test comment for RBAC",
      anchor: { type: "heading", heading_path: "## Test", line_hint: 1 }
    });

    const viewer = await createUser({
      username: "viewer",
      email: "viewer@example.com",
      display_name: "Viewer",
      password: "password123",
      memberships: [{ project_id: "project-default", project_role: "viewer" }]
    });
    const viewerAuth = await getAuthenticatedUserFromToken(
      (await authenticateUser("viewer", "password123")).token
    );

    await expect(
      updateComment(comment._id, "resolved", viewerAuth)
    ).rejects.toThrow(/cannot comment/i);
  });

  it("filters listProjectCatalog by membership for non-admin users", async () => {
    const eng = await getAuthenticatedUserFromToken(
      (await authenticateUser("eng", "password123")).token
    );

    const engProjects = await listProjectCatalog(eng);
    expect(engProjects.every((p) => p._id === "project-default")).toBe(true);

    const admin = await getAuthenticatedUserFromToken(
      (await authenticateUser("admin", "password123")).token
    );

    const adminProjects = await listProjectCatalog(admin);
    expect(adminProjects.length).toBeGreaterThanOrEqual(2);
  });
});
