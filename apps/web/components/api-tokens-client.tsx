"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { showError } from "../lib/toast";

interface TokenRow {
  _id: string;
  user_id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function ApiTokensClient({
  userId,
  labels
}: {
  userId: string;
  labels: {
    createToken: string;
    tokenName: string;
    tokenNamePlaceholder: string;
    revokeToken: string;
    tokenCreated: string;
    copyToken: string;
    copied: string;
    closeDialog: string;
    noTokens: string;
    noTokensDescription: string;
    tokenPrefix: string;
    tokenCreatedAt: string;
    tokenLastUsed: string;
    tokenNeverUsed: string;
    tokenRevoked: string;
    revokeConfirm: string;
    createTokenFailed: string;
  };
}) {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchTokens = useCallback(async () => {
    const response = await fetch("/api/api-tokens");
    if (response.ok) {
      setTokens(await response.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  async function createToken() {
    if (!name.trim()) return;
    setCreating(true);
    const response = await fetch("/api/api-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() })
    });
    setCreating(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      showError(payload?.error ?? labels.createTokenFailed);
      return;
    }

    const data = await response.json();
    setNewToken(data.token);
    setName("");
    void fetchTokens();
  }

  async function revokeToken(id: string) {
    if (!window.confirm(labels.revokeConfirm)) return;
    await fetch(`/api/api-tokens/${id}`, { method: "DELETE" });
    void fetchTokens();
    router.refresh();
  }

  function copyToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  return (
    <div className="space-y-6">
      {newToken && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="mb-3 text-sm font-medium text-emerald-900">{labels.tokenCreated}</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 overflow-x-auto rounded-xl bg-white px-4 py-3 font-mono text-sm text-slate-800 shadow-sm">
              {newToken}
            </code>
            <button
              type="button"
              onClick={() => copyToClipboard(newToken)}
              className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              {copied ? labels.copied : labels.copyToken}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewToken(null)}
            className="mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-900"
          >
            {labels.closeDialog}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {labels.tokenName}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={labels.tokenNamePlaceholder}
            className="w-full max-w-xs rounded-xl border border-transparent bg-[var(--surface-low)] px-3 py-2.5 text-sm outline-none focus:border-[var(--primary-soft)] focus:ring-2 focus:ring-[var(--primary-soft)]"
          />
        </div>
        <button
          type="button"
          onClick={() => void createToken()}
          disabled={creating || !name.trim()}
          className="rounded-2xl bg-[var(--tertiary)] px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_26px_rgba(0,90,130,0.24)] disabled:!bg-slate-300 disabled:!text-slate-500 disabled:!shadow-none disabled:cursor-not-allowed"
        >
          {creating ? "..." : labels.createToken}
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">...</div>
      ) : tokens.length === 0 ? (
        <div className="rounded-lg bg-[var(--surface-low)] px-5 py-10 text-center">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            {labels.noTokens}
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
            {labels.noTokensDescription}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <div
              key={token._id}
              className="flex flex-wrap items-center gap-4 rounded-2xl bg-[var(--surface-card)] p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-slate-900 truncate">{token.name}</p>
                  {token.revoked_at && (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.12em] text-red-700">
                      {labels.tokenRevoked}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-[family-name:var(--font-label)] text-[11px] tracking-wide text-slate-500">
                  <span>
                    {labels.tokenPrefix}: <code className="font-mono">{token.prefix}****</code>
                  </span>
                  <span>
                    {labels.tokenCreatedAt}: {formatDate(token.created_at)}
                  </span>
                  <span>
                    {labels.tokenLastUsed}:{" "}
                    {token.last_used_at ? formatDate(token.last_used_at) : labels.tokenNeverUsed}
                  </span>
                </div>
              </div>
              {!token.revoked_at && (
                <button
                  type="button"
                  onClick={() => void revokeToken(token._id)}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  {labels.revokeToken}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
