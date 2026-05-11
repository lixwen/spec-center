"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { showError } from "../lib/toast";

export function LoginForm({
  submitLabel,
  pendingLabel,
  errorLabel,
  usernameLabel,
  passwordLabel,
  noAccountLabel,
  goRegisterLabel
}: {
  submitLabel: string;
  pendingLabel: string;
  errorLabel: string;
  usernameLabel: string;
  passwordLabel: string;
  noAccountLabel: string;
  goRegisterLabel: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    setPending(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      showError(payload?.error ?? errorLabel);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">{usernameLabel}</span>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">{passwordLabel}</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
      <p className="text-center text-sm text-slate-500">
        {noAccountLabel}{" "}
        <Link href="/register" className="font-medium text-[var(--primary)] hover:underline">
          {goRegisterLabel}
        </Link>
      </p>
    </form>
  );
}
