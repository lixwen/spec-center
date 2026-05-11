"use client";

import {
  LayoutDashboard,
  GitPullRequest,
  CheckSquare,
  FileText,
  MessageCircle,
  Terminal,
  Key,
  FolderKanban,
  Users,
  Database,
  UserCheck,
  Settings,
  Activity
} from "lucide-react";
import type { ComponentType } from "react";

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard,
  "git-pull-request": GitPullRequest,
  "check-square": CheckSquare,
  "file-text": FileText,
  "message-circle": MessageCircle,
  terminal: Terminal,
  key: Key,
  "folder-kanban": FolderKanban,
  users: Users,
  database: Database,
  "user-check": UserCheck,
  settings: Settings,
  activity: Activity
};

export type NavIconName = keyof typeof iconMap;

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}
