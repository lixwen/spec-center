"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Project } from "@spec-center/core";
import { Card } from "./ui";
import { showSuccess, showError } from "../lib/toast";

type ProjectDraft = {
  slug: string;
  name: string;
  description: string;
};

type ViewMode = "list" | "create" | "edit";

type EditTab = "settings" | "reviewers";

interface ReviewerRow {
  user: string;
  role: string;
}

interface UserOption {
  username: string;
  display_name: string;
}

function toDraft(project?: Project | null): ProjectDraft {
  return {
    slug: project?.slug ?? "",
    name: project?.name ?? "",
    description: project?.description ?? ""
  };
}

function ProjectCard({
  project,
  selected,
  onClick,
  labels
}: {
  project: Project;
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
          <p className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">
            {project.name}
          </p>
          <p className="mt-1 truncate font-[family-name:var(--font-mono)] text-xs text-slate-500">
            {project.slug}
          </p>
        </div>
        {project.is_default && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            {labels.defaultProject}
          </span>
        )}
      </div>
      {project.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
          {project.description}
        </p>
      )}
    </button>
  );
}

export function ProjectManagementClient({
  projects,
  labels,
  reviewerData
}: {
  projects: Project[];
  labels: Record<string, string>;
  reviewerData?: {
    activeProjectId: string;
    reviewers: ReviewerRow[];
    users: UserOption[];
    labels: {
      user: string;
      role: string;
      addReviewer: string;
      removeReviewer: string;
      save: string;
      saveFailed: string;
      selectUser: string;
      tabSettings: string;
      tabReviewers: string;
    };
  };
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editTab, setEditTab] = useState<EditTab>("settings");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<ProjectDraft>(toDraft());
  const [editDraft, setEditDraft] = useState<ProjectDraft>(toDraft());
  const [pendingAction, setPendingAction] = useState<"create" | "save" | "default" | "delete" | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewerRows, setReviewerRows] = useState<ReviewerRow[]>(
    reviewerData?.reviewers.map((r) => ({ user: r.user, role: r.role })) ?? []
  );
  const [reviewerPending, setReviewerPending] = useState(false);

  const selectedProject = useMemo(
    () => (selectedProjectId ? projects.find((p) => p._id === selectedProjectId) ?? null : null),
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (selectedProject) {
      setEditDraft(toDraft(selectedProject));
      setErrors({});
    }
  }, [selectedProject?._id]);

  function selectProjectForEdit(projectId: string) {
    setSelectedProjectId(projectId);
    setViewMode("edit");
    setEditTab("settings");
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

  function validate(draft: ProjectDraft): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!draft.name.trim()) {
      errs.name = labels.validationNameRequired ?? "Project name is required";
    }
    if (!draft.slug.trim() || draft.slug.trim().length < 2) {
      errs.slug = labels.validationSlugRequired ?? "Project slug is required (min 2 chars)";
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
      throw new Error(payload?.error ?? labels.projectSaveFailed);
    }
    return response.json();
  }

  async function create() {
    const validationErrors = validate(createDraft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setPendingAction("create");
    try {
      await submit("/api/projects", "POST", createDraft);
      showSuccess(labels.projectCreated ?? "Project created");
      setCreateDraft(toDraft());
      setViewMode("list");
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : labels.projectSaveFailed);
    } finally {
      setPendingAction(null);
    }
  }

  async function save() {
    if (!selectedProject) return;
    const validationErrors = validate(editDraft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setPendingAction("save");
    try {
      await submit(`/api/projects/${selectedProject._id}`, "PATCH", editDraft);
      showSuccess(labels.projectSaved ?? "Project saved");
      setViewMode("list");
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : labels.projectSaveFailed);
    } finally {
      setPendingAction(null);
    }
  }

  async function makeDefault() {
    if (!selectedProject || selectedProject.is_default) return;
    setPendingAction("default");
    try {
      await submit(`/api/projects/${selectedProject._id}`, "PATCH", { is_default: true });
      showSuccess(labels.projectSetDefault ?? "Set as default project");
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : labels.projectSaveFailed);
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteSelectedProject() {
    if (!selectedProject) return;
    setPendingAction("delete");
    try {
      await fetch(`/api/projects/${selectedProject._id}`, { method: "DELETE" });
      showSuccess(labels.projectDeleted ?? "Project deleted");
      setShowDeleteConfirm(false);
      setViewMode("list");
      setSelectedProjectId(null);
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : (labels.deleteProjectFailed ?? "Could not delete project"));
    } finally {
      setPendingAction(null);
    }
  }

  function renderFieldError(field: string) {
    if (!errors[field]) return null;
    return <p className="mt-1 text-xs text-rose-600">{errors[field]}</p>;
  }

  function renderForm(
    draft: ProjectDraft,
    onChange: (updater: (d: ProjectDraft) => ProjectDraft) => void,
    repoBindings: { repo: string; default_branch: string }[]
  ) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{labels.projectName}</span>
            <input
              value={draft.name}
              onChange={(e) => {
                onChange((d) => ({ ...d, name: e.target.value }));
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
              }}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--tertiary)]/30 ${
                errors.name ? "border-rose-400" : "border-slate-300"
              }`}
            />
            {renderFieldError("name")}
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{labels.projectSlug}</span>
            <input
              value={draft.slug}
              onChange={(e) => {
                onChange((d) => ({ ...d, slug: e.target.value }));
                if (errors.slug) setErrors((prev) => ({ ...prev, slug: "" }));
              }}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--tertiary)]/30 ${
                errors.slug ? "border-rose-400" : "border-slate-300"
              }`}
            />
            {renderFieldError("slug")}
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{labels.projectDescription}</span>
          <textarea
            value={draft.description}
            onChange={(e) => onChange((d) => ({ ...d, description: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--tertiary)]/30"
          />
        </label>

        {repoBindings.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">{labels.repoBindings}</p>
            <p className="text-xs text-slate-400">{labels.repoBindingsAutoHint}</p>
            {repoBindings.map((binding, index) => (
              <div
                key={`${binding.repo}-${index}`}
                className="flex items-center gap-3 rounded-xl bg-[var(--surface-low)] px-4 py-3"
              >
                <span className="font-[family-name:var(--font-mono)] text-sm text-slate-700">
                  {binding.repo}
                </span>
                <span className="text-xs text-slate-400">
                  ({binding.default_branch})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const safeUsers = reviewerData?.users ?? [];
  const selectedUsers = new Set(reviewerRows.map((r) => r.user));

  function addReviewerRow() {
    setReviewerRows((prev) => [...prev, { user: "", role: "" }]);
  }

  function removeReviewerRow(index: number) {
    setReviewerRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateReviewerRow(index: number, field: keyof ReviewerRow, value: string) {
    setReviewerRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function saveReviewers() {
    if (!reviewerData || !selectedProject) return;
    setReviewerPending(true);
    const response = await fetch(`/api/projects/${selectedProject._id}/reviewers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewers: reviewerRows
          .filter((r) => r.user && r.role)
          .map((r) => ({ user: r.user, role: r.role }))
      })
    });
    setReviewerPending(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      showError(payload?.error ?? reviewerData.labels.saveFailed);
      return;
    }
    showSuccess(reviewerData.labels.save);
    router.refresh();
  }

  function renderReviewersPanel() {
    if (!reviewerData) return null;
    const rl = reviewerData.labels;
    return (
      <div className="space-y-4">
        {reviewerRows.map((row, index) => (
          <div
            key={index}
            className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--surface-low)] p-4"
          >
            <select
              value={row.user}
              onChange={(e) => updateReviewerRow(index, "user", e.target.value)}
              className="w-64 rounded-xl border border-transparent bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--primary-soft)] focus:ring-2 focus:ring-[var(--primary-soft)]"
            >
              <option value="">{rl.selectUser}</option>
              {safeUsers.map((u) => (
                <option
                  key={u.username}
                  value={u.username}
                  disabled={selectedUsers.has(u.username) && row.user !== u.username}
                >
                  {u.display_name} (@{u.username})
                </option>
              ))}
            </select>
            <input
              value={row.role}
              onChange={(e) => updateReviewerRow(index, "role", e.target.value)}
              placeholder={rl.role}
              className="w-32 rounded-xl border border-transparent bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--primary-soft)] focus:ring-2 focus:ring-[var(--primary-soft)]"
            />
            <button
              type="button"
              onClick={() => removeReviewerRow(index)}
              className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              {rl.removeReviewer}
            </button>
          </div>
        ))}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={addReviewerRow}
            className="rounded-lg bg-[var(--surface-high)] px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
          >
            {rl.addReviewer}
          </button>
          <button
            type="button"
            onClick={() => void saveReviewers()}
            disabled={reviewerPending}
            className="rounded-lg bg-[var(--tertiary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {reviewerPending ? "..." : rl.save}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {viewMode === "list" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {projects.length} {labels.projectsCount ?? "projects"}
            </p>
            <button
              type="button"
              onClick={startCreate}
              className="rounded-lg bg-[var(--tertiary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
            >
              {labels.createProject}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project._id}
                project={project}
                selected={selectedProjectId === project._id}
                onClick={() => selectProjectForEdit(project._id)}
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
              {labels.createProject}
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
                {pendingAction === "create" ? "..." : labels.createProject}
              </button>
            </div>
          </div>
          <div className="mt-5">
            {renderForm(createDraft, (updater) => setCreateDraft((d) => updater(d)), [])}
          </div>
        </Card>
      )}

      {showDeleteConfirm && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">
              {labels.deleteProject ?? "Delete Project"}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {labels.deleteProjectConfirm ?? "Are you sure you want to delete this project?"}
            </p>
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-slate-700">
              {selectedProject.name}
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={pendingAction === "delete"}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-[var(--surface-low)] transition"
              >
                {labels.cancel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void deleteSelectedProject()}
                disabled={pendingAction === "delete"}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 transition disabled:opacity-50"
              >
                {pendingAction === "delete" ? "..." : (labels.deleteProject ?? "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewMode === "edit" && selectedProject && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
                {selectedProject.name}
              </h3>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-slate-500">
                {selectedProject._id}
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
              {!selectedProject.is_default && (
                <button
                  type="button"
                  onClick={() => void makeDefault()}
                  disabled={pendingAction !== null}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-[var(--surface-low)] transition disabled:opacity-50"
                >
                  {pendingAction === "default" ? "..." : labels.setDefault}
                </button>
              )}
              {selectedProject.is_default && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  {labels.defaultProject}
                </span>
              )}
              {!selectedProject.is_default && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={pendingAction !== null}
                  className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
                >
                  {labels.deleteProject ?? "Delete"}
                </button>
              )}
              {editTab === "settings" && (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={pendingAction !== null}
                  className="rounded-lg bg-[var(--tertiary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50"
                >
                  {pendingAction === "save" ? "..." : labels.saveProject}
                </button>
              )}
            </div>
          </div>

          {reviewerData && (
            <div className="mt-5 flex gap-1 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setEditTab("settings")}
                className={`px-4 py-2.5 text-sm font-medium transition ${
                  editTab === "settings"
                    ? "border-b-2 border-[var(--tertiary)] text-[var(--tertiary)]"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {reviewerData.labels.tabSettings}
              </button>
              <button
                type="button"
                onClick={() => setEditTab("reviewers")}
                className={`px-4 py-2.5 text-sm font-medium transition ${
                  editTab === "reviewers"
                    ? "border-b-2 border-[var(--tertiary)] text-[var(--tertiary)]"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {reviewerData.labels.tabReviewers}
              </button>
            </div>
          )}

          <div className="mt-5">
            {editTab === "settings" && renderForm(editDraft, (updater) => setEditDraft((d) => updater(d)), selectedProject.repo_bindings)}
            {editTab === "reviewers" && renderReviewersPanel()}
          </div>
        </Card>
      )}
    </>
  );
}
