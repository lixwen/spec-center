"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@spec-center/core";
import { Card } from "./ui";
import { showSuccess, showError } from "../lib/toast";

type MembershipDraft = {
  project_id: string;
  project_role: "project_admin" | "pm" | "reviewer" | "viewer";
};

type UserDraft = {
  username: string;
  email: string;
  display_name: string;
  password: string;
  global_roles: Array<"platform_admin">;
  memberships: MembershipDraft[];
  status?: "active" | "disabled";
};

type ViewMode = "list" | "create" | "edit";

function toDraft(user?: UserProfile | null): UserDraft {
  return {
    username: user?.username ?? "",
    email: user?.email ?? "",
    display_name: user?.display_name ?? "",
    password: "",
    global_roles: user?.global_roles ?? [],
    memberships: user?.memberships ?? [],
    status: user?.status ?? "active"
  };
}

function stripEmptyFields(draft: UserDraft, isCreate: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (isCreate) {
    body.username = draft.username;
    body.password = draft.password;
    if (draft.email.trim()) {
      body.email = draft.email;
    }
  } else if (draft.password.length > 0) {
    body.password = draft.password;
  }

  body.display_name = draft.display_name;
  body.global_roles = draft.global_roles;
  body.memberships = draft.memberships;

  if (!isCreate) {
    body.status = draft.status;
  }

  return body;
}

function UserCard({
  user,
  selected,
  onClick,
  labels
}: {
  user: UserProfile;
  selected: boolean;
  onClick: () => void;
  labels: Record<string, string>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl px-4 py-4 text-left transition ${
        selected
          ? "bg-[var(--primary-soft)] ring-2 ring-[var(--tertiary)]/30"
          : "bg-[var(--surface-low)] hover:bg-[var(--surface-high)]"
      }`}
    >
        <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{user.display_name}</p>
          <p className="mt-1 truncate font-[family-name:var(--font-mono)] text-xs text-slate-500">
            @{user.username}{user.email ? ` · ${user.email}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            user.status === "active"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-200 text-slate-500"
          }`}
        >
          {user.status}
        </span>
      </div>
      {user.global_roles.includes("platform_admin") && (
        <span className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
          {labels.platformAdmin}
        </span>
      )}
    </button>
  );
}

export function UserManagementClient({
  users,
  projects,
  labels
}: {
  users: UserProfile[];
  projects: Array<{ _id: string; name: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<UserDraft>(toDraft());
  const [editDraft, setEditDraft] = useState<UserDraft>(toDraft());
  const [pendingAction, setPendingAction] = useState<"create" | "save" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedUser = useMemo(
    () => (selectedUserId ? users.find((u) => u._id === selectedUserId) ?? null : null),
    [users, selectedUserId]
  );

  useEffect(() => {
    if (selectedUser) {
      setEditDraft(toDraft(selectedUser));
      setErrors({});
    }
  }, [selectedUser?._id]);

  function selectUserForEdit(userId: string) {
    setSelectedUserId(userId);
    setViewMode("edit");
    setErrors({});
  }

  function startCreate() {
    setCreateDraft(toDraft());
    setViewMode("create");
    setErrors({});
  }

  function backToList() {
    setViewMode("list");
    setErrors({});
  }

  function validateCreate(draft: UserDraft): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!draft.username || !/^[a-zA-Z0-9_-]{3,32}$/.test(draft.username)) {
      errs.username = labels.validationUsernameRequired ?? "Username must be 3-32 characters (letters, digits, _ or -)";
    }
    if (!draft.display_name.trim()) {
      errs.display_name = labels.validationNameRequired ?? "Display name is required";
    }
    if (draft.password.length < 8) {
      errs.password = labels.validationPasswordMin ?? "Password must be at least 8 characters";
    }
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
      errs.email = labels.validationEmailRequired ?? "Valid email is required";
    }
    return errs;
  }

  function validateEdit(draft: UserDraft): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!draft.display_name.trim()) {
      errs.display_name = labels.validationNameRequired ?? "Display name is required";
    }
    if (draft.password.length > 0 && draft.password.length < 8) {
      errs.password = labels.validationPasswordMin ?? "Password must be at least 8 characters";
    }
    return errs;
  }

  async function submit(url: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error ?? labels.userSaveFailed);
    }
  }

  async function create() {
    const validationErrors = validateCreate(createDraft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setPendingAction("create");
    try {
      await submit("/api/users", "POST", stripEmptyFields(createDraft, true));
      showSuccess(labels.userCreated ?? "User created");
      setCreateDraft(toDraft());
      setViewMode("list");
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : labels.userSaveFailed);
    } finally {
      setPendingAction(null);
    }
  }

  async function save() {
    if (!selectedUser) return;

    const validationErrors = validateEdit(editDraft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setPendingAction("save");
    try {
      await submit(
        `/api/users/${selectedUser._id}`,
        "PATCH",
        stripEmptyFields(editDraft, false)
      );
      showSuccess(labels.userSaved ?? "User saved");
      setViewMode("list");
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : labels.userSaveFailed);
    } finally {
      setPendingAction(null);
    }
  }

  function renderFieldError(field: string) {
    if (!errors[field]) return null;
    return <p className="mt-1 text-xs text-rose-600">{errors[field]}</p>;
  }

  function renderForm(
    draft: UserDraft,
    onChange: (next: UserDraft) => void,
    mode: "create" | "edit"
  ) {
    const isCreate = mode === "create";
    return (
      <div className="space-y-5">
        {isCreate && (
          <>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{labels.userUsername ?? "Username"} <span className="text-rose-500">*</span></span>
              <input
                value={draft.username}
                onChange={(e) => {
                  onChange({ ...draft, username: e.target.value });
                  if (errors.username) setErrors((prev) => ({ ...prev, username: "" }));
                }}
                placeholder="username"
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--tertiary)]/30 ${
                  errors.username ? "border-rose-400" : "border-slate-300"
                }`}
              />
              {renderFieldError("username")}
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{labels.userEmail}</span>
              <input
                value={draft.email}
                onChange={(e) => {
                  onChange({ ...draft, email: e.target.value });
                  if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                }}
                placeholder="user@example.com"
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--tertiary)]/30 ${
                  errors.email ? "border-rose-400" : "border-slate-300"
                }`}
              />
              {renderFieldError("email")}
            </label>
          </>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{labels.userDisplayName}</span>
          <input
            value={draft.display_name}
            onChange={(e) => {
              onChange({ ...draft, display_name: e.target.value });
              if (errors.display_name)
                setErrors((prev) => ({ ...prev, display_name: "" }));
            }}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--tertiary)]/30 ${
              errors.display_name ? "border-rose-400" : "border-slate-300"
            }`}
          />
          {renderFieldError("display_name")}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            {labels.userPassword}
            {!isCreate && (
              <span className="ml-2 font-normal text-slate-400">
                ({labels.passwordOptionalHint ?? "leave blank to keep current"})
              </span>
            )}
          </span>
          <input
            type="password"
            value={draft.password}
            onChange={(e) => {
              onChange({ ...draft, password: e.target.value });
              if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
            }}
            placeholder={isCreate ? "min 8 characters" : ""}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--tertiary)]/30 ${
              errors.password ? "border-rose-400" : "border-slate-300"
            }`}
          />
          {renderFieldError("password")}
        </label>

        <label className="flex items-center gap-3 rounded-lg bg-[var(--surface-low)] px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={draft.global_roles.includes("platform_admin")}
            onChange={(e) =>
              onChange({
                ...draft,
                global_roles: e.target.checked ? ["platform_admin"] : []
              })
            }
            className="accent-[var(--tertiary)]"
          />
          <span>{labels.platformAdmin}</span>
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">{labels.memberships}</p>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  memberships: [
                    ...draft.memberships,
                    { project_id: projects[0]?._id ?? "", project_role: "viewer" }
                  ]
                })
              }
              className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-[var(--surface-low)] transition"
            >
              {labels.addMembership}
            </button>
          </div>
          {draft.memberships.map((membership, index) => (
            <div
              key={`${membership.project_id}-${index}`}
              className="grid gap-3 md:grid-cols-[1fr_180px_auto]"
            >
              <select
                value={membership.project_id}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    memberships: draft.memberships.map((entry, i) =>
                      i === index ? { ...entry, project_id: e.target.value } : entry
                    )
                  })
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <select
                value={membership.project_role}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    memberships: draft.memberships.map((entry, i) =>
                      i === index
                        ? { ...entry, project_role: e.target.value as MembershipDraft["project_role"] }
                        : entry
                    )
                  })
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="project_admin">project_admin</option>
                <option value="pm">pm</option>
                <option value="reviewer">reviewer</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    memberships: draft.memberships.filter((_, i) => i !== index)
                  })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-rose-50 hover:text-rose-600 transition"
              >
                {labels.removeMembership}
              </button>
            </div>
          ))}
        </div>

        {!isCreate && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{labels.userStatus}</span>
            <select
              value={draft.status}
              onChange={(e) =>
                onChange({ ...draft, status: e.target.value as "active" | "disabled" })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
        )}
      </div>
    );
  }

  return (
    <>
      {viewMode === "list" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {users.length} {labels.usersCount ?? "users"}
            </p>
            <button
              type="button"
              onClick={startCreate}
              className="rounded-lg bg-[var(--tertiary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
            >
              {labels.createUser}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => (
              <UserCard
                key={user._id}
                user={user}
                selected={selectedUserId === user._id}
                onClick={() => selectUserForEdit(user._id)}
                labels={labels}
              />
            ))}
          </div>
        </div>
      )}

      {viewMode === "create" && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
              {labels.createUser}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={backToList}
                disabled={pendingAction !== null}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-[var(--surface-low)] transition"
              >
                {labels.cancel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void create()}
                disabled={pendingAction !== null}
                className="rounded-lg bg-[var(--tertiary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50"
              >
                {pendingAction === "create" ? "..." : labels.createUser}
              </button>
            </div>
          </div>
          <div className="mt-5">
            {renderForm(createDraft, setCreateDraft, "create")}
          </div>
        </Card>
      )}

      {viewMode === "edit" && selectedUser && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
                {selectedUser.display_name}
              </h3>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-slate-500">
                @{selectedUser.username}{selectedUser.email ? ` · ${selectedUser.email}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={backToList}
                disabled={pendingAction !== null}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-[var(--surface-low)] transition"
              >
                {labels.cancel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={pendingAction !== null}
                className="rounded-lg bg-[var(--tertiary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50"
              >
                {pendingAction === "save" ? "..." : labels.saveUser}
              </button>
            </div>
          </div>
          <div className="mt-5">
            {renderForm(editDraft, setEditDraft, "edit")}
          </div>
        </Card>
      )}
    </>
  );
}
