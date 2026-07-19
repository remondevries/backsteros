import type { ComponentType } from "react";

import type { NavigationItemIconId } from "../navigation.js";
import {
  ContactsNavIcon,
  InboxNavIcon,
  JournalNavIcon,
  KnowledgeBaseNavIcon,
  LettersNavIcon,
  OrganizationsNavIcon,
  ProjectsNavIcon,
  SidebarSettingsIcon,
  TasksNavIcon,
} from "./sidebar-nav-icons.js";

export const NAVIGATION_ITEM_ICONS: Record<
  NavigationItemIconId,
  ComponentType<{ className?: string }>
> = {
  inbox: InboxNavIcon,
  journal: JournalNavIcon,
  knowledge: KnowledgeBaseNavIcon,
  tasks: TasksNavIcon,
  projects: ProjectsNavIcon,
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

export function NavigationItemIcon({
  navId,
  className = "nav-icon",
  iconClassName,
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
