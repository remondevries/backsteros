"use client";

import { useMemo, useState, type ComponentType, type ReactNode } from "react";

import {
  emailListItemIsSelected,
  formatEmailPersonWithAddress,
  getEmailComposeHref,
  getEmailListItemHref,
  groupEmailItemsByStatus,
  parseReplyToAddress,
  resolveEmailListItemStatus,
  type EmailListItem,
  type EmailMailbox,
} from "../../email/email.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "../content/content-side-panel-list.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import {
  TaskListDueDateLabel,
  TaskListPriorityMark,
} from "../tasks/task-list-property-label.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { Tooltip } from "../shared/tooltip.js";

export type EmailSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  "aria-label"?: string;
  children?: ReactNode;
}>;

function FallbackEmailLink({
  to,
  className,
  children,
  ...rest
}: {
  to: string;
  className?: string;
  "aria-current"?: "page";
  "aria-label"?: string;
  children?: ReactNode;
}) {
  return (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  );
}

export type EmailSidePanelViewProps = {
  pathname: string;
  mailboxes: EmailMailbox[];
  items?: EmailListItem[];
  loading?: boolean;
  messagesLoading?: boolean;
  apiKeyConfigured?: boolean;
  Link?: EmailSidePanelLinkComponent;
  composeHref?: string;
  onCompose?: () => void;
};

function emailFromDisplayName(from: string): string {
  const trimmed = from.trim();
  if (!trimmed) return "Unknown sender";
  const angle = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle?.[1]?.trim()) return angle[1].trim();
  return parseReplyToAddress(trimmed) || trimmed;
}

function formatEmailListRelativeTime(receivedAt: number): string {
  if (!Number.isFinite(receivedAt) || receivedAt <= 0) return "";
  const deltaSec = Math.round((Date.now() - receivedAt) / 1000);
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))}m`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h`;
  if (deltaSec < 86_400 * 7) return `${Math.round(deltaSec / 86_400)}d`;
  return new Date(receivedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function EmailMessageRow({
  item,
  selected,
  LinkComponent,
}: {
  item: EmailListItem;
  selected: boolean;
  LinkComponent: EmailSidePanelLinkComponent;
}) {
  const status = resolveEmailListItemStatus(item);
  const priority = item.priority ?? 0;
  const relativeTime = formatEmailListRelativeTime(item.receivedAt);
  const dueDate =
    item.dueDate == null
      ? null
      : item.dueDate instanceof Date
        ? item.dueDate
        : new Date(item.dueDate);
  const hasDue = dueDate != null && !Number.isNaN(dueDate.getTime());
  const projectLabel =
    item.projectName?.trim() || item.projectKey?.trim() || null;
  const organizationLabel = item.organizationName?.trim() || null;
  const contactName = item.contactName?.trim() || null;
  const fromLabel = emailFromDisplayName(item.from);
  const fromEmail = parseReplyToAddress(item.from.trim());
  const personLabel = contactName
    ? formatEmailPersonWithAddress(contactName, item.from)
    : fromLabel;
  const hasLinkedContact = Boolean(item.contactId && contactName);
  const hasTitleStack = Boolean(projectLabel || organizationLabel);

  let personChip: ReactNode;
  if (hasLinkedContact) {
    personChip = item.contactAvatarSrc ? (
      <span className="inbox-list-item-assignee-avatar">
        <AssigneeListMark
          label={personLabel}
          avatarSrc={item.contactAvatarSrc}
          size={18}
        />
      </span>
    ) : (
      <span className="inbox-list-item-truncate email-side-panel-contact-name">
        {contactName}
        {fromEmail.includes("@") ? (
          <span className="email-side-panel-contact-email"> {fromEmail}</span>
        ) : null}
      </span>
    );
  } else {
    personChip = (
      <span className="inbox-list-item-truncate email-side-panel-from-fallback">
        {fromLabel}
      </span>
    );
  }

  return (
    <li className="inbox-list-item">
      <div
        className={`${sidePanelItemClass({
          active: selected,
          stacked: true,
        })} inbox-list-item-card`}
      >
        <LinkComponent
          to={getEmailListItemHref(item)}
          aria-current={selected ? "page" : undefined}
          aria-label={item.subject.trim() || "(no subject)"}
          className="inbox-list-item-hit-area"
        />
        <div
          className={`app-side-panel-item-row-primary inbox-list-item-card-layer${
            hasTitleStack ? " email-side-panel-primary--with-stack" : ""
          }`}
        >
          <span className="email-side-panel-status-slot">
            {hasTitleStack ? (
              <span
                className="email-side-panel-status-spacer"
                data-lines={String(
                  (projectLabel ? 1 : 0) + (organizationLabel ? 1 : 0),
                )}
                aria-hidden="true"
              />
            ) : null}
            <TaskStatusIcon status={status} size={14} />
          </span>
          <span
            className={`inbox-list-item-title-wrap${
              hasTitleStack ? " email-side-panel-title-stack" : ""
            }`}
          >
            {projectLabel ? (
              <span className="email-side-panel-project-label">
                <ProjectOcticon icon={null} size={11} />
                <span className="inbox-list-item-truncate">{projectLabel}</span>
              </span>
            ) : null}
            {organizationLabel ? (
              <span className="email-side-panel-org-label">
                {organizationLabel}
              </span>
            ) : null}
            <span className="inbox-list-item-title">
              {item.conceptDraftId ? (
                <>
                  <span className="email-side-panel-concept-label">Concept</span>
                  {" · "}
                </>
              ) : null}
              {item.subject.trim() || "(no subject)"}
            </span>
          </span>
        </div>
        <div className="app-side-panel-item-row-meta app-side-panel-item-row-meta-inbox inbox-list-item-card-layer">
          {relativeTime ? (
            <span className="email-side-panel-received-at" title={relativeTime}>
              {relativeTime}
            </span>
          ) : null}
          <TaskListPriorityMark priority={priority} />
          {hasDue ? (
            <TaskListDueDateLabel dueDate={dueDate!} status={status} />
          ) : null}
          <Tooltip label={personLabel}>
            <span
              className="inbox-list-item-assignee"
              aria-label={personLabel}
            >
              {personChip}
            </span>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}

/**
 * Left rail for Email — status groups with task-style rows.
 */
export function EmailSidePanelView({
  pathname,
  mailboxes,
  items = [],
  loading = false,
  messagesLoading = false,
  apiKeyConfigured = false,
  Link: LinkComponent = FallbackEmailLink,
  composeHref = getEmailComposeHref(),
  onCompose,
}: EmailSidePanelViewProps) {
  const groups = useMemo(() => groupEmailItemsByStatus(items), [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggleGroup(status: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  let body: ReactNode;
  if (loading) {
    body = (
      <ContentSidePanelEmpty>Loading inboxes…</ContentSidePanelEmpty>
    );
  } else if (!apiKeyConfigured) {
    body = (
      <ContentSidePanelEmpty>
        Connect AgentMail in Settings → E-mail to show inboxes here.
      </ContentSidePanelEmpty>
    );
  } else if (mailboxes.length === 0) {
    body = (
      <ContentSidePanelEmpty>
        No inboxes selected. Choose them in Settings → E-mail.
      </ContentSidePanelEmpty>
    );
  } else if (messagesLoading && items.length === 0) {
    body = (
      <ContentSidePanelEmpty>Loading messages…</ContentSidePanelEmpty>
    );
  } else if (items.length === 0) {
    body = <ContentSidePanelEmpty>No messages yet</ContentSidePanelEmpty>;
  } else {
    body = (
      <ContentSidePanelList aria-label="Email by status">
        {groups.map((group) => (
          <StatusGroupSection
            key={group.status}
            groupKey={group.status}
            title={group.label}
            collapsed={collapsed.has(group.status)}
            onToggle={() => toggleGroup(group.status)}
          >
            {group.items.map((item) => (
              <EmailMessageRow
                key={`${item.inboxId}:${item.id}`}
                item={item}
                selected={emailListItemIsSelected(item, pathname)}
                LinkComponent={LinkComponent}
              />
            ))}
          </StatusGroupSection>
        ))}
      </ContentSidePanelList>
    );
  }

  return (
    <div className="app-content-side-panel">
      <ContentSidePanelHeader
        title="Email"
        actions={
          onCompose ? (
            <button
              type="button"
              className="app-side-panel-section-action"
              aria-label="Compose email"
              onClick={onCompose}
            >
              <SidePanelPlusIcon />
            </button>
          ) : (
            <LinkComponent
              to={composeHref}
              className="app-side-panel-section-action"
              aria-label="Compose email"
            >
              <SidePanelPlusIcon />
            </LinkComponent>
          )
        }
      />
      <div className="app-content-side-panel-main">{body}</div>
    </div>
  );
}
