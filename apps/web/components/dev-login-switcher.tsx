"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showError } from "../lib/toast";

type DemoUser = {
  username: string;
  email?: string;
  label: string;
  role: string;
};

export function DevLoginSwitcher({
  users,
  activeUser,
  submitLabel,
  pendingLabel,
  errorLabel
}: {
  users: DemoUser[];
  activeUser: string;
  submitLabel: string;
  pendingLabel: string;
  errorLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function setUser(user: string) {
    setPending(user);
    const response = await fetch("/api/preferences/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    setPending(null);

    if (!response.ok) {
      showError(errorLabel);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {users.map((user) => {
        const active = user.username === activeUser;
        const busy = pending === user.username;
        return (
          <button
            key={user.username}
            onClick={() => void setUser(user.username)}
            disabled={busy}
            className={`rounded-xl px-4 py-4 text-left transition ${
              active
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--surface-low)] hover:bg-[var(--surface-high)]"
            }`}
          >
            <p className="font-medium">{user.username}</p>
            <p className={`mt-1 text-sm ${active ? "text-white/80" : "text-slate-600"}`}>
              {user.role}
            </p>
            <p
              className={`mt-4 font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] ${
                active ? "text-white/72" : "text-[var(--tertiary)]"
              }`}
            >
              {busy ? pendingLabel : active ? user.label : submitLabel}
            </p>
          </button>
        );
      })}
    </div>
  );
}
