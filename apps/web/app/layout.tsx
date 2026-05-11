import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono, Manrope, Space_Grotesk } from "next/font/google";
import { MessageCircle } from "lucide-react";
import { Toaster } from "sonner";
import "@toast-ui/editor/dist/toastui-editor-viewer.css";
import { AppShellLayout } from "../components/app-shell-layout";
import { AppShellSearch } from "../components/app-shell-search";
import { AppShellUserMenu } from "../components/app-shell-user-menu";
import { LanguageSwitcher } from "../components/language-switcher";
import { ProjectSwitcher } from "../components/project-switcher";
import { SpecCenterLogo } from "../components/spec-center-logo";
import { getRequestMessages } from "../lib/locale";
import { getProjectContext } from "../lib/project";
import { getCurrentUser, isPlatformAdmin, isProjectAdmin } from "../lib/session";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-display"
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-label"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Spec Center",
  description: "Desktop review surfaces for Change, Product Spec, and baseline-aware collaboration."
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, messages } = await getRequestMessages();
  const currentUser = await getCurrentUser();
  const admin = isPlatformAdmin(currentUser);
  const { activeProject, projects } = currentUser
    ? await getProjectContext(currentUser)
    : { activeProject: null, projects: [] };
  const projectAdmin = isProjectAdmin(currentUser, activeProject?._id);
  const projectNavItems = [
    { href: "/", label: messages.layout.navigation.home, shortLabel: "WB", iconName: "layout-dashboard" },
    { href: "/changes", label: messages.layout.navigation.changes, shortLabel: "CH", iconName: "git-pull-request" },
    { href: "/tasks", label: messages.layout.navigation.tasks, shortLabel: "TK", iconName: "check-square" },
    { href: "/product-specs", label: messages.layout.navigation.productSpecs, shortLabel: "PS", iconName: "file-text" },
    { href: "/ask", label: messages.layout.navigation.ask, shortLabel: "AI", iconName: "message-circle" }
  ];
  const navigation = activeProject
    ? projectNavItems
    : [];
  const userSettingsNavigation = currentUser
    ? [{ href: "/settings/api-tokens", label: messages.settings.apiTokensEyebrow, shortLabel: "TK", iconName: "key" }]
    : [];
  const projectAdminNavigation = projectAdmin
    ? [
        { href: "/settings/projects", label: messages.settings.projectsEyebrow, shortLabel: "PM", iconName: "folder-kanban" }
      ]
    : [];
  const adminNavigation = admin
    ? [
        ...(!projectAdmin
          ? [{ href: "/settings/projects", label: messages.settings.projectsEyebrow, shortLabel: "PM", iconName: "folder-kanban" }]
          : []),
        { href: "/settings/users", label: messages.settings.usersEyebrow, shortLabel: "UM", iconName: "users" },
        { href: "/settings/embedding-tasks", label: messages.embeddingTasks.eyebrow, shortLabel: "ET", iconName: "database" },
        { href: "/admin/ai-traces", label: messages.aiTracesAdmin.navLabel, shortLabel: "AT", iconName: "activity" }
      ]
    : [];
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get("sidebar-collapsed")?.value === "true";

  return (
    <html lang={locale}>
      <body
        className={`${manrope.variable} ${inter.variable} ${spaceGrotesk.variable} ${mono.variable} font-[family-name:var(--font-body)] antialiased`}
      >
        <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between bg-[color:rgba(247,249,251,0.88)] px-6 backdrop-blur-md">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5">
              <SpecCenterLogo size={24} className="text-[var(--primary)]" />
              <p className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.03em] text-slate-900">
                {messages.layout.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {activeProject ? (
              <>
                <ProjectSwitcher
                  activeProjectId={activeProject._id}
                  projects={projects.map((project) => ({
                    _id: project._id,
                    name: project.name,
                    slug: project.slug
                  }))}
                />
                <Link
                  href="/ask"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-[family-name:var(--font-label)] text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Ask AI
                </Link>
              </>
            ) : null}
            <AppShellSearch placeholder={messages.common.searchPlaceholder} />
            {currentUser ? (
              <AppShellUserMenu
                username={currentUser.username}
                label={currentUser.label}
                displayName={currentUser.display_name}
                userLabel={messages.common.userLabel}
                locale={locale}
                localeLabel={messages.common.localeLabel}
                localeOptions={[
                  { value: "en", label: messages.common.localeNames.en },
                  { value: "zh-CN", label: messages.common.localeNames["zh-CN"] }
                ]}
                requestFailedLabel={messages.common.requestFailed}
                pendingLabel={messages.common.working}
                signOutLabel={messages.common.signOut}
              />
            ) : (
              <>
                <LanguageSwitcher
                  locale={locale}
                  label={messages.common.localeLabel}
                  options={[
                    { value: "en", label: messages.common.localeNames.en },
                    { value: "zh-CN", label: messages.common.localeNames["zh-CN"] }
                  ]}
                  errorLabel={messages.common.requestFailed}
                  pendingLabel={messages.common.working}
                />
                <Link href="/login" className="text-sm font-medium text-[var(--primary)]">
                  {messages.common.signIn}
                </Link>
              </>
            )}
          </div>
        </header>
        <AppShellLayout
          navigation={navigation}
          settingsNavigation={[...userSettingsNavigation, ...projectAdminNavigation, ...adminNavigation]}
          projectName={activeProject?.name}
          projectSlug={activeProject?.slug}
          title={messages.layout.title}
          phaseLabel={messages.layout.phaseLabel}
          settingsTitle={messages.settings.navigationTitle}
          defaultCollapsed={sidebarCollapsed}
        >
          {children}
        </AppShellLayout>
        <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 3000 }} visibleToasts={3} />
      </body>
    </html>
  );
}
