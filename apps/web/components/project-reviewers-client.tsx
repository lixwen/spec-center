"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showError } from "../lib/toast";

interface ReviewerRow {
  user: string;
  role: string;
}

interface UserOption {
  username: string;
  display_name: string;
}

export function ProjectReviewersClient({
  projectId,
  initialReviewers,
  users,
  labels
}: {
  projectId: string;
  initialReviewers: ReviewerRow[];
  users: UserOption[];
  labels: {
    user: string;
    role: string;
    addReviewer: string;
    removeReviewer: string;
    save: string;
    saveFailed: string;
    selectUser: string;
  };
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewerRow[]>(
    initialReviewers.map((r) => ({
      user: r.user,
      role: r.role
    }))
  );
  const [pending, setPending] = useState(false);

  const safeUsers = users ?? [];
  const selectedUsers = new Set(rows.map((r) => r.user));

  function addRow() {
    setRows((prev) => [...prev, { user: "", role: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof ReviewerRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function selectUser(index: number, username: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, user: username } : row))
    );
  }

  async function save() {
    setPending(true);
    const response = await fetch(`/api/projects/${projectId}/reviewers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewers: rows
          .filter((r) => r.user && r.role)
          .map((r) => ({
            user: r.user,
            role: r.role
          }))
      })
    });
    setPending(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      showError(payload?.error ?? labels.saveFailed);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <div
          key={index}
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--surface-card)] p-4"
        >
          <select
            value={row.user}
            onChange={(e) => selectUser(index, e.target.value)}
            className="w-64 rounded-xl border border-transparent bg-[var(--surface-low)] px-3 py-2.5 text-sm outline-none focus:border-[var(--primary-soft)] focus:ring-2 focus:ring-[var(--primary-soft)]"
          >
            <option value="">{labels.selectUser}</option>
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
            onChange={(e) => updateRow(index, "role", e.target.value)}
            placeholder={labels.role}
            className="w-32 rounded-xl border border-transparent bg-[var(--surface-low)] px-3 py-2.5 text-sm outline-none focus:border-[var(--primary-soft)] focus:ring-2 focus:ring-[var(--primary-soft)]"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            {labels.removeReviewer}
          </button>
        </div>
      ))}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-2xl bg-[var(--surface-high)] px-5 py-2.5 text-sm font-medium text-slate-800"
        >
          {labels.addReviewer}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending}
          className="rounded-2xl bg-[var(--tertiary)] px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_26px_rgba(0,90,130,0.24)] disabled:opacity-60"
        >
          {pending ? "..." : labels.save}
        </button>
      </div>
    </div>
  );
}
