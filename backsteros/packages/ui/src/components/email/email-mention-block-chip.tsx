"use client";

import { forwardRef, type HTMLAttributes, type ReactNode, type Ref } from "react";

import { ChatCardHref } from "../chat/chat-card-navigate.js";
import { parseReplyToAddress } from "../../email/email.js";
import type { MentionCatalogEmail } from "../../mentions/mention-menu-types.js";
import {
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../../tasks/task-due-date.js";
import { getDisplayProjectIcon, ProjectOcticon } from "../projects/project-octicon.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { TaskDueDateIcon } from "../tasks/task-due-date-icon.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";

export type EmailMentionBlockChipEmail = Pick<
  MentionCatalogEmail,
  | "displayId"
  | "title"
  | "status"
  | "priority"
  | "dueDate"
  | "receivedAt"
  | "from"
  | "projectName"
  | "contactName"
>;

type ChipRestProps = Omit<HTMLAttributes<HTMLElement>, "children" | "title">;

export type EmailMentionBlockChipProps = ChipRestProps & {
  email: EmailMentionBlockChipEmail;
  /** Omit for non-navigating chrome (e.g. chat `<details>` summary). */
  href?: string | null;
  titleAttr?: string | null;
};

/** Contact name when linked; otherwise the bare From address. */
export function emailMentionChipPartyLabel(
  contactName: string | null | undefined,
  from: string | null | undefined,
): string | null {
  const linked = contactName?.trim() || null;
  if (linked) return linked;
  const raw = typeof from === "string" ? from.trim() : "";
  if (!raw) return null;
  const address = parseReplyToAddress(raw);
  if (address.includes("@")) return address;
  return raw;
}

function EmailMentionBlockChipContent({
  email,
}: {
  email: EmailMentionBlockChipEmail;
}): ReactNode {
  const dueDateLabel =
    email.dueDate != null ? formatTaskDueMetaLabel(email.dueDate) : null;
  const receivedLabel =
    email.receivedAt != null ? formatTaskDueMetaLabel(email.receivedAt) : null;
  const label = email.title?.trim() || "Email";
  const partyLabel = emailMentionChipPartyLabel(email.contactName, email.from);

  return (
    <>
      <TaskPriorityIcon
        priority={email.priority}
        size={14}
        className="mention-chip-lite__meta-icon"
      />
      <span className="mention-chip-lite__icon" aria-hidden="true">
        <EmailNavIcon size={14} />
      </span>
      <span className="mention-chip-lite__title-group mention-chip-lite__label--grow">
        <span className="mention-chip-lite__label">{label}</span>
        {partyLabel ? (
          <span className="mention-chip-lite__from">{partyLabel}</span>
        ) : null}
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
      {receivedLabel ? (
        <span className="mention-chip-lite__received">{receivedLabel}</span>
      ) : null}
      {email.projectName ? (
        <span className="mention-chip-lite__project">
          <ProjectOcticon icon={getDisplayProjectIcon(null)} size={12} />
          <span>{email.projectName}</span>
        </span>
      ) : null}
    </>
  );
}

export const EmailMentionBlockChip = forwardRef<
  HTMLAnchorElement | HTMLDivElement,
  EmailMentionBlockChipProps
>(function EmailMentionBlockChip(
  { email, href = null, titleAttr = null, className, ...rest },
  ref,
) {
  const title =
    titleAttr?.trim() || email.title?.trim() || email.displayId || "Email";
  const chipClassName = [
    "mention-chip-lite",
    "mention-chip-lite--email",
    "mention-chip-lite--block",
    href ? "mention-chip-lite--link" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <ChatCardHref
        ref={ref as Ref<HTMLAnchorElement>}
        href={href}
        className={chipClassName}
        title={title}
        {...rest}
      >
        <EmailMentionBlockChipContent email={email} />
      </ChatCardHref>
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={chipClassName}
      title={title}
      {...rest}
    >
      <EmailMentionBlockChipContent email={email} />
    </div>
  );
});
