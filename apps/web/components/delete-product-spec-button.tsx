"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showError } from "../lib/toast";

export function DeleteProductSpecButton({
  specId,
  labels
}: {
  specId: string;
  labels: {
    deleteSpec: string;
    confirmTitle: string;
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
      const response = await fetch(`/api/product-specs/${specId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        showError(payload?.error ?? labels.error);
        setDeleting(false);
        setConfirming(false);
        return;
      }
      router.push("/product-specs");
      router.refresh();
    } catch {
      showError(labels.error);
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-900">{labels.confirmTitle}</p>
          <p className="mt-0.5 text-xs text-red-700">{labels.confirmMessage}</p>
        </div>
        <button
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {deleting ? "..." : labels.confirm}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded-lg bg-white px-4 py-1.5 text-xs font-medium text-slate-600 border border-slate-200"
        >
          {labels.cancel}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-lg border border-red-200 bg-red-50 px-5 py-2.5 font-[family-name:var(--font-label)] text-sm font-medium text-red-700 hover:bg-red-100"
    >
      {labels.deleteSpec}
    </button>
  );
}
