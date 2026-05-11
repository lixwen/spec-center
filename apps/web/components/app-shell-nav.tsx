"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./nav-icons";

export function AppShellNav({
  items,
  showPrefix = true,
  collapsed = false
}: {
  items: { href: string; label: string; shortLabel?: string; iconName?: string }[];
  showPrefix?: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        if (collapsed) {
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center rounded-md py-2.5 transition-colors ${
                active
                  ? "bg-[var(--primary-soft)] text-[#131b2e]"
                  : "text-slate-500 hover:bg-[var(--surface-high)]"
              }`}
            >
              {item.iconName ? (
                <NavIcon name={item.iconName} className="h-[18px] w-[18px]" />
              ) : (
                <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.16em]">
                  {item.shortLabel ?? item.label.slice(0, 2)}
                </span>
              )}
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-4 py-2.5 font-[family-name:var(--font-label)] text-sm transition-colors ${
              active
                ? "bg-[var(--primary-soft)] text-[#131b2e]"
                : "text-slate-600 hover:bg-[var(--surface-high)]"
            }`}
          >
            {showPrefix ? (
              item.iconName ? (
                <NavIcon name={item.iconName} className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#131b2e]" : "text-slate-400"}`} />
              ) : (
                <span className="inline-flex min-w-7 justify-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  {item.shortLabel ?? item.label.slice(0, 2)}
                </span>
              )
            ) : null}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
