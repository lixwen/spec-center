"use client";

import { useState } from "react";
import { ChevronsLeft } from "lucide-react";
import { AppShellNav } from "./app-shell-nav";
import { SpecCenterLogo } from "./spec-center-logo";

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  iconName?: string;
}

interface AppShellLayoutProps {
  navigation: NavItem[];
  settingsNavigation: NavItem[];
  projectName?: string;
  projectSlug?: string;
  title: string;
  phaseLabel: string;
  settingsTitle: string;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}

export function AppShellLayout({
  navigation,
  settingsNavigation,
  projectName,
  projectSlug,
  title,
  phaseLabel,
  settingsTitle,
  defaultCollapsed,
  children
}: AppShellLayoutProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sidebar-collapsed=${next};path=/;max-age=31536000`;
  }

  return (
    <>
      <aside
        className={`fixed bottom-0 left-0 top-16 hidden flex-col bg-[var(--surface-low)] transition-all duration-300 ease-in-out lg:flex ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${collapsed ? "px-2 py-4" : "p-6"}`}>
          {!collapsed && (
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                <SpecCenterLogo size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">
                  {projectName ?? title}
                </h2>
                <p className="truncate font-[family-name:var(--font-label)] text-xs text-slate-500">
                  {projectSlug ?? phaseLabel}
                </p>
              </div>
            </div>
          )}

          {collapsed && (
            <div className="mb-4 flex items-center justify-center">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                <SpecCenterLogo size={18} />
              </div>
            </div>
          )}

          <nav className="space-y-1">
            <AppShellNav items={navigation} collapsed={collapsed} />
          </nav>

          {settingsNavigation.length > 0 && (
            <div className="mt-8">
              {!collapsed && (
                <p className="mb-3 px-4 font-[family-name:var(--font-label)] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {settingsTitle}
                </p>
              )}
              <nav className="space-y-1">
                <AppShellNav items={settingsNavigation} collapsed={collapsed} />
              </nav>
            </div>
          )}
        </div>

        <button
          onClick={toggleCollapsed}
          className="flex h-12 items-center justify-center border-t border-slate-200 text-slate-400 transition-colors hover:bg-[var(--surface-high)] hover:text-slate-600"
          title={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          <ChevronsLeft
            className={`h-4 w-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      </aside>

      <main
        className={`min-h-screen px-4 pb-10 pt-24 transition-all duration-300 ease-in-out md:px-6 lg:px-8 ${
          collapsed ? "lg:ml-16" : "lg:ml-64"
        }`}
      >
        <div className="mx-auto max-w-[1600px]">{children}</div>
      </main>
    </>
  );
}
