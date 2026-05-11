"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showError } from "../lib/toast";

export function ProjectSwitcher({
  activeProjectId,
  projects
}: {
  activeProjectId: string;
  projects: { _id: string; name: string; slug: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <label className="flex items-center gap-3">
      <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
        Project
      </span>
      <select
        value={activeProjectId}
        disabled={pending}
        onChange={async (event) => {
          setPending(true);
          const response = await fetch("/api/preferences/project", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ projectId: event.target.value })
          });
          setPending(false);

          if (!response.ok) {
            showError("Failed to switch project.");
            return;
          }

          router.refresh();
        }}
        className="rounded-md bg-[var(--surface-low)] px-3 py-2 text-sm text-slate-700 outline-none"
      >
        {projects.map((project) => (
          <option key={project._id} value={project._id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}
