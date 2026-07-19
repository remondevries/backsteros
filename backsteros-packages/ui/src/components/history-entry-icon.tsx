"use client";

import type { ComponentType } from "react";

import type { HistoryEntryDisplay } from "../resolve-history-entry-display.js";
import type { NavigationItemIconId } from "../navigation.js";
import type { TaskStatus } from "../task-status.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { DocumentIcon } from "./document-icon.js";
import { LetterIcon } from "./letter-icon.js";
import { OrganizationIcon } from "./organization-icon.js";
import { ProjectOcticon } from "./project-octicon.js";
import {
  ContactsNavIcon,
  InboxNavIcon,
  JournalNavIcon,
  KnowledgeBaseNavIcon,
  LettersNavIcon,
  OrganizationsNavIcon,
  TasksNavIcon,
} from "./sidebar-nav-icons.js";
import { TaskStatusIcon } from "./task-status-icon.js";

function SettingsHistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.00001 5.25C6.48123 5.25 5.25001 6.48122 5.25001 8C5.25001 9.51878 6.48123 10.75 8.00001 10.75C9.51879 10.75 10.75 9.51878 10.75 8C10.75 6.48122 9.51879 5.25 8.00001 5.25ZM6.75001 8C6.75001 7.30964 7.30965 6.75 8.00001 6.75C8.69037 6.75 9.25001 7.30964 9.25001 8C9.25001 8.69036 8.69037 9.25 8.00001 9.25C7.30965 9.25 6.75001 8.69036 6.75001 8Z"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.675 1.675C8.3 1.3 7.70001 1.3 7.32501 1.675L6.67501 2.325C6.52501 2.475 6.32501 2.55 6.12501 2.55H5.25001C4.69772 2.55 4.25001 2.99772 4.25001 3.55V4.425C4.25001 4.625 4.17501 4.825 4.02501 4.975L3.37501 5.625C3.00001 6 3.00001 6.6 3.37501 6.975L4.02501 7.625C4.17501 7.775 4.25001 7.975 4.25001 8.175V9.05C4.25001 9.60228 4.69772 10.05 5.25001 10.05H6.12501C6.32501 10.05 6.52501 10.125 6.67501 10.275L7.32501 10.925C7.70001 11.3 8.3 11.3 8.675 10.925L9.32501 10.275C9.47501 10.125 9.67501 10.05 9.87501 10.05H10.75C11.3023 10.05 11.75 9.60228 11.75 9.05V8.175C11.75 7.975 11.825 7.775 11.975 7.625L12.625 6.975C13 6.6 13 6 12.625 5.625L11.975 4.975C11.825 4.825 11.75 4.625 11.75 4.425V3.55C11.75 2.99772 11.3023 2.55 10.75 2.55H9.87501C9.67501 2.55 9.47501 2.475 9.32501 2.325L8.675 1.675Z"
      />
    </svg>
  );
}

const ICON_CLASS = "size-3.5 shrink-0 text-foreground/70";

const NAVIGATION_ICONS: Record<
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
  settings: SettingsHistoryIcon,
};

type HistoryEntryIconProps = {
  display: HistoryEntryDisplay;
  icon?: string | null;
  taskStatus?: TaskStatus | null;
};

export function HistoryEntryIcon({
  display,
  icon,
  taskStatus,
}: HistoryEntryIconProps) {
  if (display.kind === "document") {
    return (
      <span className="app-side-panel-history-entry-icon" aria-hidden="true">
        {icon ? (
          <ProjectOcticon icon={icon} size={14} className={ICON_CLASS} />
        ) : (
          <DocumentIcon size={14} className={ICON_CLASS} />
        )}
      </span>
    );
  }

  if (display.kind === "journal") {
    if (icon != null) {
      return (
        <span className="app-side-panel-history-entry-icon" aria-hidden="true">
          <ProjectOcticon icon={icon} size={14} className={ICON_CLASS} />
        </span>
      );
    }

    return (
      <span className="app-side-panel-history-entry-icon" aria-hidden="true">
        <JournalNavIcon className={ICON_CLASS} />
      </span>
    );
  }

  if (display.kind === "letter") {
    return (
      <span className="app-side-panel-history-entry-icon" aria-hidden="true">
        {icon ? (
          <ProjectOcticon icon={icon} size={14} className={ICON_CLASS} />
        ) : (
          <LetterIcon size={14} className={ICON_CLASS} />
        )}
      </span>
    );
  }

  if (display.kind === "task" && taskStatus) {
    return (
      <span className="app-side-panel-history-entry-icon" aria-hidden="true">
        <TaskStatusIcon status={taskStatus} size={14} className="shrink-0" />
      </span>
    );
  }

  if (display.kind === "navigate" && display.navId) {
    const NavIcon = NAVIGATION_ICONS[display.navId];
    if (!NavIcon) {
      return null;
    }

    return (
      <span className="app-side-panel-history-entry-icon" aria-hidden="true">
        <NavIcon className={ICON_CLASS} />
      </span>
    );
  }

  let Icon: ComponentType<{ className?: string }> | null = null;

  switch (display.kind) {
    case "task":
      Icon = TasksNavIcon;
      break;
    case "contact":
      Icon = ContactPersonIcon;
      break;
    case "organization":
      Icon = OrganizationIcon;
      break;
    case "project":
      return (
        <span className="app-side-panel-history-entry-icon" aria-hidden="true">
          <ProjectOcticon icon={icon} size={14} className={ICON_CLASS} />
        </span>
      );
    case "settings":
      Icon = SettingsHistoryIcon;
      break;
    case "navigate":
      Icon = InboxNavIcon;
      break;
  }

  if (!Icon) {
    return null;
  }

  return (
    <span className="app-side-panel-history-entry-icon" aria-hidden="true">
      <Icon className={ICON_CLASS} />
    </span>
  );
}
