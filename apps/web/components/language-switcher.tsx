"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "../lib/i18n";
import { showError } from "../lib/toast";

export function LanguageSwitcher({
  locale,
  label,
  options,
  errorLabel,
  pendingLabel
}: {
  locale: Locale;
  label: string;
  options: { value: Locale; label: string }[];
  errorLabel: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <span className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <div className="inline-flex rounded-md bg-[var(--surface-low)] p-1">
        {options.map((option) => {
          const active = option.value === locale;

          return (
            <button
              key={option.value}
              disabled={pending || active}
              className={`rounded px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-[var(--surface-card)] text-slate-900 shadow-[0_1px_0_rgba(25,28,30,0.04)]"
                  : "text-slate-500 hover:text-slate-900"
              } disabled:cursor-not-allowed disabled:opacity-70`}
              onClick={async () => {
                setPending(true);
                const response = await fetch("/api/preferences/locale", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({ locale: option.value })
                });

                setPending(false);

                if (!response.ok) {
                  showError(errorLabel);
                  return;
                }

                router.refresh();
              }}
            >
              {pending && active ? pendingLabel : option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
