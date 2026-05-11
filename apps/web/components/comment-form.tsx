"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showError } from "../lib/toast";

export function CommentForm({
  sessionId,
  specId,
  author,
  placeholder = "Add a review comment tied to the current baseline...",
  submitLabel = "Add Comment",
  errorLabel = "Could not create comment",
  headingLabel = "Heading path",
  lineLabel = "Line hint"
}: {
  sessionId: string;
  specId: string;
  author: string;
  placeholder?: string;
  submitLabel?: string;
  errorLabel?: string;
  headingLabel?: string;
  lineLabel?: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [headingPath, setHeadingPath] = useState("## Review Notes");
  const [lineHint, setLineHint] = useState("1");

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();

        if (!content.trim()) {
          return;
        }

        const response = await fetch(
          `/api/reviews/${sessionId}/specs/${specId}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              author,
              content,
              anchor: {
                type: "heading",
                heading_path: headingPath.trim() || "## Review Notes",
                line_hint: Number(lineHint) > 0 ? Number(lineHint) : 1
              }
            })
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          showError(payload?.error ?? errorLabel);
          return;
        }

        setContent("");
        router.refresh();
      }}
    >
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        className="min-h-28 w-full rounded-xl border border-[var(--outline)] bg-[var(--surface-low)] px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-sky-400"
      />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
        <label className="space-y-2">
          <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {headingLabel}
          </span>
          <input
            value={headingPath}
            onChange={(event) => setHeadingPath(event.target.value)}
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-low)] px-4 py-3 text-sm outline-none"
          />
        </label>
        <label className="space-y-2">
          <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {lineLabel}
          </span>
          <input
            type="number"
            min={1}
            value={lineHint}
            onChange={(event) => setLineHint(event.target.value)}
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-low)] px-4 py-3 text-sm outline-none"
          />
        </label>
      </div>
      <button className="rounded-lg bg-[var(--tertiary)] px-4 py-2 text-sm font-medium text-white">
        {submitLabel}
      </button>
    </form>
  );
}
