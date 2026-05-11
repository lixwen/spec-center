"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showError, showInfo } from "../lib/toast";

export function ActionButton({
  label,
  endpoint,
  method = "POST",
  body,
  className,
  pendingLabel = "Working...",
  errorLabel = "Request failed"
}: {
  label: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  body?: unknown;
  className?: string;
  pendingLabel?: string;
  errorLabel?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      className={
        className ??
        "rounded-lg bg-gradient-to-br from-[var(--primary)] to-[#656d84] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      }
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const response = await fetch(endpoint, {
          method,
          headers: {
            "Content-Type": "application/json"
          },
          body: body ? JSON.stringify(body) : undefined
        });

        setPending(false);

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          showError(payload?.error ?? errorLabel);
          return;
        }

        const payload = await response.json().catch(() => null);
        if (payload?.guidance) {
          showInfo(payload.guidance);
        }

        router.refresh();
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
