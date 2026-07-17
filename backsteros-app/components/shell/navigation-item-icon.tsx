import type { ComponentType } from "react";

import { DefaultProjectIcon } from "@/components/project-icon/default-project-icon";
import {
  ContactsNavIcon,
  InboxNavIcon,
  JournalNavIcon,
  KnowledgeBaseNavIcon,
  LettersNavIcon,
  OrganizationsNavIcon,
  SidebarSettingsIcon,
  TasksNavIcon,
} from "@/components/shell/sidebar-nav-icons";

/** Icons for top-level nav destinations — same set as the left sidebar. */
export type NavigationItemIconId =
  | "inbox"
  | "journal"
  | "tasks"
  | "projects"
  | "knowledge"
  | "letters"
  | "organizations"
  | "contacts"
  | "settings";

export const NAVIGATION_ITEM_ICONS: Record<
  NavigationItemIconId,
  ComponentType<{ className?: string }>
> = {
  inbox: InboxNavIcon,
  journal: JournalNavIcon,
  knowledge: KnowledgeBaseNavIcon,
  tasks: TasksNavIcon,
  projects: DefaultProjectIcon,
  letters: LettersNavIcon,
  contacts: ContactsNavIcon,
  organizations: OrganizationsNavIcon,
  settings: SidebarSettingsIcon,
};

export function getNavigationItemIcon(
  navId: string,
): ComponentType<{ className?: string }> | null {
  return NAVIGATION_ITEM_ICONS[navId as NavigationItemIconId] ?? null;
}

type NavigationItemIconProps = {
  navId: string;
  className?: string;
  iconClassName?: string;
};

/** Renders the sidebar icon for a navigation destination (palette, tabs, etc.). */
export function NavigationItemIcon({
  navId,
  className = "nav-icon",
  iconClassName = "size-4 shrink-0",
}: NavigationItemIconProps) {
  const Icon = getNavigationItemIcon(navId);

  if (!Icon) {
    return null;
  }

  return (
    <span className={className} aria-hidden="true">
      <Icon className={iconClassName} />
    </span>
  );
}
