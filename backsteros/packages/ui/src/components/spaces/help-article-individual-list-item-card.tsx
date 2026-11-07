"use client";

import type { ComponentType, MouseEvent, ReactNode } from "react";

import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { keyboardNavItemProps } from "../../list-nav/keyboard-nav-item.js";
import {
  getHelpArticleStatusLabel,
  normalizeHelpArticleStatus,
  type HelpArticleStatus,
} from "../../spaces/help-article-properties.js";
import { DocumentIcon } from "../documents/document-icon.js";
import {
  ListItemMetaProperties,
} from "../list-nav/list-item-meta.js";
import { AssigneeListMark } from "../tasks/assignee-list-mark.js";
import { Tooltip } from "../shared/tooltip.js";
import { HelpArticleStatusIcon } from "./help-article-status-icon.js";

export type HelpArticleIndividualListContact = {
  id: string;
  name: string;
  avatarSrc?: string | null;
};

/** Matches document-tree Link props so the same shell Link can be reused. */
export type HelpArticleIndividualListItemCardLinkComponent = ComponentType<{
  to: string;
  className?: string;
  title?: string;
  onClick?: () => void;
  onDoubleClick?: (event: MouseEvent) => void;
  children: ReactNode;
  [key: string]: unknown;
}>;

export type HelpArticleIndividualListItemCardProps = {
  title: string;
  href: string;
  Link: HelpArticleIndividualListItemCardLinkComponent;
  active?: boolean;
  keyboardHighlighted?: boolean;
  itemId: string;
  status?: HelpArticleStatus | string | null;
  contacts?: readonly HelpArticleIndividualListContact[];
  /** Short “Appears in” label (already path-trimmed). */
  appearsInLabel?: string | null;
  /** When false, hide the contacts meta row (e.g. list already grouped by contact). */
  showContacts?: boolean;
  onActivate?: () => void;
  onDoubleClickTitle?: (event: MouseEvent) => void;
  className?: string;
};

const MAX_VISIBLE_CONTACTS = 3;

/**
 * Inbox-style stacked card for Support center Individual articles —
 * title plus status, contacts, and Appears in meta.
 */
export function HelpArticleIndividualListItemCard({
  title,
  href,
  Link,
  active = false,
  keyboardHighlighted = false,
  itemId,
  status: statusRaw,
  contacts = [],
  appearsInLabel = null,
  showContacts = true,
  onActivate,
  onDoubleClickTitle,
  className,
}: HelpArticleIndividualListItemCardProps) {
  const status = normalizeHelpArticleStatus(
    typeof statusRaw === "string" ? statusRaw : null,
  );
  const statusLabel = getHelpArticleStatusLabel(status);
  const displayTitle = title.trim() || "Untitled";
  const contactNames = contacts.map((contact) => contact.name).filter(Boolean);
  const contactsLabel =
    contactNames.length > 0 ? contactNames.join(", ") : "No contacts";
  const visibleContacts = contacts.slice(0, MAX_VISIBLE_CONTACTS);
  const overflowCount = Math.max(0, contacts.length - visibleContacts.length);
  const appearsIn = appearsInLabel?.trim() || null;

  const cardClassName = [
    sidePanelItemClass({
      active,
      keyboardHighlighted,
      stacked: true,
    }),
    "inbox-list-item-card",
    "help-article-individual-list-item-card",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClassName}>
      <Link
        to={href}
        aria-current={active ? "page" : undefined}
        aria-label={displayTitle}
        className="inbox-list-item-hit-area"
        onClick={onActivate}
        {...keyboardNavItemProps(itemId)}
      >
        {null}
      </Link>
      <div className="app-side-panel-item-row-primary inbox-list-item-card-layer email-side-panel-primary--with-stack">
        <span className="email-side-panel-status-slot" aria-hidden="true">
          <span className="email-side-panel-status-spacer" data-lines="1" />
          <DocumentIcon size={14} className="shrink-0" />
        </span>
        <span className="inbox-list-item-title-wrap inbox-list-item-title-wrap--stack help-article-individual-list-item-card__title-stack">
          <span
            className="inbox-list-item-card-subtitle help-article-individual-list-item-card__status"
            title={statusLabel}
            aria-label={`Status: ${statusLabel}`}
          >
            <HelpArticleStatusIcon status={status} size={12} />
            <span className="inbox-list-item-truncate">{statusLabel}</span>
          </span>
          <span
            className="inbox-list-item-title"
            title={displayTitle}
            onDoubleClick={onDoubleClickTitle}
          >
            {displayTitle}
          </span>
          <span
            className="inbox-list-item-card-subtitle help-article-individual-list-item-card__appears-in"
            title={appearsIn ?? "No section"}
            aria-label={`Appears in: ${appearsIn ?? "No section"}`}
          >
            <span className="inbox-list-item-truncate">
              {appearsIn ?? "No section"}
            </span>
          </span>
        </span>
      </div>
      {showContacts ? (
        <ListItemMetaProperties>
          <Tooltip label={contactsLabel}>
            <span
              className="inbox-list-item-meta-label help-article-individual-list-item-card__contacts"
              aria-label={`Contacts: ${contactsLabel}`}
            >
              {visibleContacts.length > 0 ? (
                <span className="help-article-individual-list-item-card__avatars">
                  {visibleContacts.map((contact) => (
                    <span
                      key={contact.id}
                      className="inbox-list-item-assignee-avatar"
                    >
                      <AssigneeListMark
                        label={contact.name}
                        avatarSrc={contact.avatarSrc}
                        size={14}
                      />
                    </span>
                  ))}
                  {overflowCount > 0 ? (
                    <span className="help-article-individual-list-item-card__avatar-more">
                      +{overflowCount}
                    </span>
                  ) : null}
                </span>
              ) : null}
              <span className="inbox-list-item-truncate">
                {contactNames.length > 0
                  ? contactNames.length === 1
                    ? contactNames[0]
                    : `${contactNames.length} contacts`
                  : "No contacts"}
              </span>
            </span>
          </Tooltip>
        </ListItemMetaProperties>
      ) : null}
    </div>
  );
}
