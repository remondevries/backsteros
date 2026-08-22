"use client";

import { ClientLink } from "../client-link.js";
import type { MentionCatalogEmail } from "../mentions/mention-menu-types.js";
import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../task-due-date.js";
import { getDisplayProjectIcon, ProjectOcticon } from "./project-octicon.js";
import { EmailNavIcon } from "./sidebar-nav-icons.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";

export type EmailMentionBlockChipEmail = Pick<
  MentionCatalogEmail,
  | "displayId"
  | "title"
  | "status"
  | "priority"
  | "dueDate"
  | "projectName"
  | "contactName"
>;

export type EmailMentionBlockChipProps = {
  email: EmailMentionBlockChipEmail;
  href: string;
  titleAttr?: string | null;
};

export function EmailMentionBlockChip({
  email,
  href,
  titleAttr = null,
}: EmailMentionBlockChipProps) {
  const dueDateLabel =
    email.dueDate != null ? formatTaskDueMetaLabel(email.dueDate) : null;
  const label = email.title?.trim() || email.displayId;

  return (
    <ClientLink
      href={href}
      className="mention-chip-lite mention-chip-lite--email mention-chip-lite--block mention-chip-lite--link"
      title={titleAttr?.trim() || email.displayId}
    >
      <TaskPriorityIcon
        priority={email.priority}
        size={14}
        className="mention-chip-lite__meta-icon"
      />
      <span className="mention-chip-lite__icon" aria-hidden="true">
        <EmailNavIcon size={14} />
      </span>
      <span className="mention-chip-lite__id">{email.displayId}</span>
      <span className="mention-chip-lite__label mention-chip-lite__label--grow">
        {label}
      </span>
      {dueDateLabel ? (
        <span className="mention-chip-lite__due">
          <TaskDueDateIcon
            active
            urgency={getTaskDueDateUrgency(email.dueDate, new Date(), {
              status: email.status,
            })}
            size={12}
          />
          <span>{dueDateLabel}</span>
        </span>
      ) : null}
      {email.projectName ? (
        <span className="mention-chip-lite__project">
          <ProjectOcticon icon={getDisplayProjectIcon(null)} size={12} />
          <span>{email.projectName}</span>
        </span>
      ) : email.contactName ? (
        <span className="mention-chip-lite__project">
          <span>{email.contactName}</span>
        </span>
      ) : null}
    </ClientLink>
  );
}
