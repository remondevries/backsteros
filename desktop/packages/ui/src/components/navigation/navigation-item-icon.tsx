import type { ComponentType } from "react";

import type { NavigationItemIconId } from "../../navigation/navigation.js";
import {
  AreasNavIcon,
  CalendarNavIcon,
  CommunicationNavIcon,
  ContactsNavIcon,
  DevelopmentNavIcon,
  EmailNavIcon,
  FinanceNavIcon,
  HabitsNavIcon,
  InboxNavIcon,
  JournalNavIcon,
  KnowledgeBaseNavIcon,
  LettersNavIcon,
  OrganizationsNavIcon,
  ProjectsNavIcon,
  SidebarSettingsIcon,
  SocialNavIcon,
  TasksNavIcon,
} from "../shell/sidebar-nav-icons.js";

export const NAVIGATION_ITEM_ICONS: Record<
  NavigationItemIconId,
  ComponentType<{ className?: string }>
> = {
  inbox: InboxNavIcon,
  email: EmailNavIcon,
  journal: JournalNavIcon,
  habits: HabitsNavIcon,
  knowledge: KnowledgeBaseNavIcon,
  tasks: TasksNavIcon,
  calendar: CalendarNavIcon,
  areas: AreasNavIcon,
  projects: ProjectsNavIcon,
  development: DevelopmentNavIcon,
  letters: LettersNavIcon,
  finance: FinanceNavIcon,
  communication: CommunicationNavIcon,
  social: SocialNavIcon,
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
