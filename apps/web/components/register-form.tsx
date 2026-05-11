"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type RegisterMessages = {
  subtitle: string;
  action: string;
  username: string;
  usernamePlaceholder: string;
  displayName: string;
  password: string;
  passwordPlaceholder: string;
  email: string;
  hasAccount: string;
  goLogin: string;
  required: string;
};

export function RegisterForm({
  messages,
  errorLabel,
  workingLabel
}: {
  messages: RegisterMessages;
  errorLabel: string;
  workingLabel: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        display_name: displayName,
        ...(email ? { email } : {})
      })
    });
    setPending(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? errorLabel);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm text-slate-600">{messages.subtitle}</p>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">
          {messages.username} <span className="text-red-500">{messages.required}</span>
        </span>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder={messages.usernamePlaceholder}
          autoComplete="username"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">
          {messages.displayName} <span className="text-red-500">{messages.required}</span>
        </span>
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          autoComplete="name"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">
          {messages.password} <span className="text-red-500">{messages.required}</span>
        </span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={messages.passwordPlaceholder}
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">{messages.email}</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? workingLabel : messages.action}
      </button>
      <p className="text-center text-sm text-slate-500">
        {messages.hasAccount}{" "}
        <Link href="/login" className="font-medium text-[var(--primary)] hover:underline">
          {messages.goLogin}
        </Link>
      </p>
    </form>
  );
}
