import Link from "next/link";
import { clsx } from "clsx";
import { getStatusLabel, type Locale } from "../lib/i18n";

export function Card({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const hasCustomBg = className?.includes("bg-");
  return (
    <section
      className={clsx(
        "rounded-lg p-5",
        !hasCustomBg && "bg-[var(--surface-card)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.22em] text-[var(--tertiary)]">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.04em]">
        {title}
      </h2>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
    </div>
  );
}

export function StatusBadge({
  status,
  locale = "en"
}: {
  status: string;
  locale?: Locale;
}) {
  const tone =
    status === "approved"
      ? "bg-sky-100 text-sky-900"
      : status === "in_review"
        ? "bg-amber-100 text-amber-900"
        : status === "changes_requested"
          ? "bg-rose-100 text-rose-900"
          : status === "archived"
            ? "bg-slate-200 text-slate-700"
            : "bg-slate-100 text-slate-900";

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 font-[family-name:var(--font-label)] text-[10px] uppercase tracking-[0.16em]",
        tone
      )}
    >
      {getStatusLabel(status, locale)}
    </span>
  );
}

export function Stat({
  label,
  value,
  href
}: {
  label: string;
  value: string | number;
  href?: string;
}) {
  const content = (
    <>
      <p className="font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.04em]">
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-lg bg-[var(--surface-low)] p-4 transition hover:bg-[var(--surface-high)]">
        {content}
      </Link>
    );
  }

  return <div className="rounded-lg bg-[var(--surface-low)] p-4">{content}</div>;
}

export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--surface-low)] px-5 py-10 text-center">
      <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{description}</p>
    </div>
  );
}

export function DataTable({
  headers,
  children
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-[var(--surface-card)]">
      <table className="w-full border-collapse text-left">
        <thead className="bg-[var(--surface-low)] font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.16em] text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-5 py-4 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({
  children,
  href
}: {
  children: React.ReactNode;
  href?: string;
}) {
  if (href) {
    return (
      <tr className="group transition-colors hover:bg-[var(--surface-low)]">
        <td colSpan={99} className="p-0">
          <Link href={href} className="block">
            <table className="w-full border-collapse">
              <tbody>
                <tr>{children}</tr>
              </tbody>
            </table>
          </Link>
        </td>
      </tr>
    );
  }

  return <tr className="transition-colors hover:bg-[var(--surface-low)]">{children}</tr>;
}
