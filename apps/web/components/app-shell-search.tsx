"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppShellSearch({
  placeholder
}: {
  placeholder: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <form
      className="hidden items-center gap-2 rounded-lg bg-[var(--surface-low)] px-3 py-2 lg:flex"
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = query.trim();
        router.push(normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search");
      }}
    >
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-slate-400">
        ⌘K
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className="w-64 bg-transparent text-sm text-slate-500 outline-none placeholder:text-slate-400"
      />
    </form>
  );
}
