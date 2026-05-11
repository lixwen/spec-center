"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showError } from "../lib/toast";

export function DeleteChangeSpecButton({
  changeId,
  specId,
  labels
}: {
  changeId: string;
  specId: string;
  labels: {
    deleteSpec: string;
    confirmMessage: string;
    confirm: string;
    cancel: string;
    error: string;
  };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/changes/${changeId}/specs/${specId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        showError(payload?.error ?? labels.error);
        setDeleting(false);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      showError(labels.error);
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
        <p className="flex-1 text-xs text-red-700">{labels.confirmMessage}</p>
        <button
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          {deleting ? "..." : labels.confirm}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded bg-white px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200"
        >
          {labels.cancel}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="mt-3 inline-flex text-xs font-medium text-red-600 hover:text-red-800"
    >
      {labels.deleteSpec}
    </button>
  );
}
