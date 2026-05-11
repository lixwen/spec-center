"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showError } from "../lib/toast";

export function ChangeCreatePanel({
  currentUser,
  currentProjectId,
  ctaLabel,
  submitLabel,
  cancelLabel,
  pendingLabel,
  errorLabel,
  labels
}: {
  currentUser: string;
  currentProjectId: string;
  ctaLabel: string;
  submitLabel: string;
  cancelLabel: string;
  pendingLabel: string;
  errorLabel: string;
  labels: {
    heading: string;
    subtitle: string;
    titlePlaceholder: string;
    descriptionPlaceholder: string;
    sprintPlaceholder: string;
    prdLinkPlaceholder: string;
    reviewRequired: string;
    ruleProject: string;
    ruleProjectDesc: string;
    ruleSprint: string;
    ruleSprintDesc: string;
    ruleNextStep: string;
    ruleNextStepDesc: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    sprint: "",
    prd_link: "",
    review_required: false
  });

  async function submit() {
    setPending(true);
    const response = await fetch("/api/changes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: currentProjectId,
        title: form.title,
        description: form.description,
        created_by: currentUser,
        review_required: form.review_required,
        sprint: form.sprint || null,
        prd_link: form.prd_link || null
      })
    });
    setPending(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      showError(payload?.error ?? errorLabel);
      return;
    }

    const created = await response.json();
    setOpen(false);
    router.push(`/changes/${created._id}`);
    router.refresh();
  }

  const inputClass =
    "rounded-2xl border border-transparent bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--primary-soft)] focus:ring-2 focus:ring-[var(--primary-soft)]";

  return (
    <div className="flex flex-col items-stretch gap-3 xl:items-end">
      <button
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--primary)] to-[#656d84] px-6 font-[family-name:var(--font-label)] text-sm font-bold text-white transition hover:opacity-92"
      >
        {ctaLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[color:rgba(15,23,42,0.34)] px-4 py-8 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/55 bg-[color:rgba(247,249,251,0.96)] shadow-[0_24px_90px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
              <section className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.22em] text-[var(--tertiary)]">
                      Change Draft
                    </p>
                    <h3 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-0.05em] text-slate-950">
                      {labels.heading}
                    </h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                      {labels.subtitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
                    aria-label={cancelLabel}
                  >
                    ×
                  </button>
                </div>

                <div className="mt-8 grid gap-4">
                  <input
                    value={form.title}
                    onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder={labels.titlePlaceholder}
                    className={inputClass}
                  />
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder={labels.descriptionPlaceholder}
                    className={`min-h-28 ${inputClass}`}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <input
                      value={form.sprint}
                      onChange={(event) => setForm((prev) => ({ ...prev, sprint: event.target.value }))}
                      placeholder={labels.sprintPlaceholder}
                      className={inputClass}
                    />
                    <input
                      value={form.prd_link}
                      onChange={(event) => setForm((prev) => ({ ...prev, prd_link: event.target.value }))}
                      placeholder={labels.prdLinkPlaceholder}
                      type="url"
                      className={inputClass}
                    />
                  </div>
                  <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={form.review_required}
                      onChange={(event) => setForm((prev) => ({ ...prev, review_required: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary-soft)]"
                    />
                    <span className="text-sm text-slate-700">{labels.reviewRequired}</span>
                  </label>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-2xl bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    onClick={() => void submit()}
                    disabled={pending}
                    className="rounded-2xl bg-[var(--tertiary)] px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_26px_rgba(0,90,130,0.24)] disabled:opacity-60"
                  >
                    {pending ? pendingLabel : submitLabel}
                  </button>
                </div>
              </section>

              <aside className="hidden bg-[linear-gradient(180deg,#13232d_0%,#20364b_100%)] p-6 text-white lg:block">
                <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.2em] text-white/48">
                  Draft Rules
                </p>
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl bg-white/8 p-4">
                    <p className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.18em] text-white/52">
                      {labels.ruleProject}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/84">
                      {labels.ruleProjectDesc}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/8 p-4">
                    <p className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.18em] text-white/52">
                      {labels.ruleSprint}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/84">
                      {labels.ruleSprintDesc}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/8 p-4">
                    <p className="font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.18em] text-white/52">
                      {labels.ruleNextStep}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/84">
                      {labels.ruleNextStepDesc}
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
