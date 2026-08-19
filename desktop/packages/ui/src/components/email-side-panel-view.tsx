"use client";

import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  emailListItemIsSelected,
  getEmailListItemHref,
  groupEmailItemsByMailbox,
  type EmailListItem,
  type EmailMailbox,
} from "../email.js";
import { sidePanelItemClass } from "../side-panel-styles.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import {
  ContentSidePanelEmpty,
  ContentSidePanelList,
} from "./content-side-panel-list.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";
import { EmailNavIcon } from "./sidebar-nav-icons.js";
import { SidePanelPlusIcon } from "./side-panel-plus-icon.js";
import { getEmailComposeHref } from "../email.js";

export type EmailSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
}>;

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

function EmailMessageRow({
  item,
  selected,
  LinkComponent,
}: {
  item: EmailListItem;
  selected: boolean;
  LinkComponent: EmailSidePanelLinkComponent;
}) {
  return (
    <li>
      <LinkComponent
        to={getEmailListItemHref(item)}
        className={sidePanelItemClass({ active: selected, stacked: true })}
        aria-current={selected ? "page" : undefined}
      >
        <span className="app-side-panel-item-row-primary">
          <span className="app-side-panel-item-icon" aria-hidden="true">
            <EmailNavIcon />
          </span>
          <span className="app-side-panel-item-label">
            {item.conceptDraftId ? (
              <>
                <span className="email-side-panel-concept-label">Concept</span>
                {" · "}
              </>
            ) : null}
            {item.subject.trim() || "(no subject)"}
          </span>
        </span>
        <span className="app-side-panel-item-row-meta">
          {item.from.trim() || "Unknown sender"}
        </span>
      </LinkComponent>
    </li>
  );
}

/**
 * Left rail for Email — one group per connected inbox, same chrome as Inbox.
 */
export function EmailSidePanelView({
  pathname,
  mailboxes,
  items = [],
  loading = false,
  messagesLoading = false,
  apiKeyConfigured = false,
  Link: LinkComponent = Link,
  composeHref = getEmailComposeHref(),
  onCompose,
}: EmailSidePanelViewProps) {
  const groups = useMemo(
    () => groupEmailItemsByMailbox(mailboxes, items),
    [items, mailboxes],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggleGroup(inboxId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(inboxId)) next.delete(inboxId);
      else next.add(inboxId);
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
  } else {
    body = (
      <ContentSidePanelList aria-label="Email inboxes">
        {groups.map((group) => (
          <ProjectTypeGroupSection
            key={group.inboxId}
            title={group.label}
            collapsed={collapsed.has(group.inboxId)}
            onToggle={() => toggleGroup(group.inboxId)}
          >
            {group.items.length === 0 ? (
              <li className="email-side-panel-empty-row">
                {messagesLoading ? "Loading messages…" : "No messages yet"}
              </li>
            ) : (
              group.items.map((item) => (
                <EmailMessageRow
                  key={`${item.inboxId}:${item.id}`}
                  item={item}
                  selected={emailListItemIsSelected(item, pathname)}
                  LinkComponent={LinkComponent}
                />
              ))
            )}
          </ProjectTypeGroupSection>
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
