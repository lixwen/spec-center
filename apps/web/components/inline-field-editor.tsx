"use client";

import { useState } from "react";
import { showError } from "../lib/toast";

export function InlineFieldEditor({
  changeId,
  version,
  field,
  value,
  type = "text",
  placeholder,
  emptyDisplay,
  labels
}: {
  changeId: string;
  version: number;
  field: string;
  value: string | null;
  type?: "text" | "url" | "textarea";
  placeholder: string;
  emptyDisplay: string;
  labels: { edit: string; save: string; cancel: string; error: string };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const response = await fetch(`/api/changes/${changeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: draft || null, version })
    });
    setSaving(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      showError(payload?.error ?? labels.error);
      return;
    }
    setEditing(false);
    window.location.reload();
  }

  if (editing) {
    const inputElement = type === "textarea" ? (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--primary-soft)] focus:ring-1 focus:ring-[var(--primary-soft)] min-h-[80px] resize-y"
        autoFocus
        rows={3}
      />
    ) : (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        type={type === "url" ? "url" : "text"}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--primary-soft)] focus:ring-1 focus:ring-[var(--primary-soft)]"
        autoFocus
      />
    );

    return (
      <div className={`flex ${type === "textarea" ? "flex-col" : "items-center"} gap-2`}>
        {inputElement}
        <div className="flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-[var(--tertiary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {labels.save}
          </button>
          <button
            onClick={() => { setEditing(false); setDraft(value ?? ""); }}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600"
          >
            {labels.cancel}
          </button>
        </div>
      </div>
    );
  }

  const displayValue = value && type === "url"
    ? <a href={value} target="_blank" rel="noopener noreferrer" className="text-[var(--tertiary)] underline">{value}</a>
    : value || <span className="text-slate-400">{emptyDisplay}</span>;

  return (
    <div className="group flex items-center gap-2">
      <span className="text-sm text-slate-700">{displayValue}</span>
      <button
        onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        className="invisible text-xs font-medium text-[var(--tertiary)] group-hover:visible"
      >
        {labels.edit}
      </button>
    </div>
  );
}
