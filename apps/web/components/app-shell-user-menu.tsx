"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../lib/i18n";
import { showError } from "../lib/toast";

type AppShellUserMenuProps = {
  username: string;
  label: string;
  displayName?: string | null;
  userLabel: string;
  locale?: Locale;
  localeLabel?: string;
  localeOptions?: { value: Locale; label: string }[];
  requestFailedLabel?: string;
  pendingLabel?: string;
  signOutLabel: string;
};

export function AppShellUserMenu({
  username,
  label,
  displayName,
  userLabel,
  locale,
  localeLabel,
  localeOptions,
  requestFailedLabel,
  pendingLabel,
  signOutLabel
}: AppShellUserMenuProps) {
  const [open, setOpen] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const router = useRouter();
  const userName = displayName?.trim() || username;
  const safeLocaleOptions = localeOptions ?? [];
  const safeLocaleLabel = localeLabel ?? "";
  const safePendingLabel = pendingLabel ?? "Working...";
  const safeRequestFailedLabel = requestFailedLabel ?? "Request failed";

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${userLabel}: ${userName}`}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-11 items-center justify-center rounded-full border text-[11px] font-bold transition duration-200 ${
          open
            ? "border-slate-500/60 bg-[linear-gradient(145deg,#f2f6ff,#dfe8ff)] text-slate-900 shadow-[0_14px_34px_rgba(37,51,77,0.22)]"
            : "border-slate-300/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(240,244,251,0.92))] text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.08)] hover:border-slate-400/80 hover:text-slate-900"
        } font-[family-name:var(--font-label)]`}
      >
        {label}
      </button>
      <div
        id={menuId}
        className={`absolute right-0 top-[calc(100%+0.8rem)] w-[18rem] overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,247,252,0.92))] p-3 text-left shadow-[0_24px_70px_rgba(15,23,42,0.20)] backdrop-blur-2xl transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-20 rounded-b-[32px] bg-[radial-gradient(circle_at_top,rgba(174,196,255,0.32),transparent_72%)]" />
        <div className="relative rounded-[22px] border border-slate-200/70 bg-[linear-gradient(135deg,rgba(240,245,255,0.96),rgba(251,252,255,0.92))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
          <p className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.2em] text-slate-500">
            {userLabel}
          </p>
          <p className="mt-3 truncate font-[family-name:var(--font-display)] text-[1.35rem] font-semibold tracking-[-0.045em] text-slate-900">
            {userName}
          </p>
          <p className="mt-1 truncate text-sm text-slate-500">@{username}</p>
        </div>
        {safeLocaleOptions.length > 0 && locale ? (
          <div className="relative mt-3 rounded-[22px] border border-slate-200/70 bg-[rgba(255,255,255,0.68)] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <div className="absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.35),transparent)]" />
            <p className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {safeLocaleLabel}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-[linear-gradient(180deg,rgba(234,239,247,0.8),rgba(247,249,252,0.95))] p-1.5 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)]">
              {safeLocaleOptions.map((option) => {
                const active = option.value === locale;
                const pending = pendingLocale === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={pendingLocale !== null || active}
                    className={`rounded-xl px-3 py-2 text-sm transition duration-200 ${
                      active
                        ? "bg-white text-slate-900 shadow-[0_8px_18px_rgba(148,163,184,0.18)]"
                        : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                    onClick={async () => {
                      setPendingLocale(option.value);
                      const response = await fetch("/api/preferences/locale", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ locale: option.value })
                      });

                      setPendingLocale(null);

                      if (!response.ok) {
                        showError(safeRequestFailedLabel);
                        return;
                      }

                      router.refresh();
                    }}
                  >
                    {pending ? safePendingLabel : option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <Link
          href="/logout"
          onClick={() => setOpen(false)}
          className="mt-3 flex items-center justify-between rounded-[22px] border border-slate-200/80 bg-white/78 px-4 py-3 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition duration-200 hover:border-slate-300 hover:bg-white hover:text-slate-900"
        >
          <span className="font-medium">{signOutLabel}</span>
          <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-slate-400">
            Esc
          </span>
        </Link>
      </div>
    </div>
  );
}
