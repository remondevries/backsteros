"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  emailMessageInvolvesContact,
  getContactEmailAddresses,
  type ContactEmailInput,
} from "@backsteros/contracts";

import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import {
  formatEmailListPartyLabel,
  groupEmailItemsByStatus,
  parseReplyToAddress,
  resolveEmailListItemStatus,
  type EmailListItem,
} from "../../email/email.js";
import { keyboardNavItemProps } from "../../list-nav/keyboard-nav-item.js";
import { flattenGroupedListItemIds } from "../../list-nav/list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import { type TaskStatus } from "../../tasks/task-status.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";

export type ContactEmailsListViewProps = {
  contactId: string;
  /** Primary + additional addresses from contact Details. */
  contactEmail?: string | null;
  contactEmails?: readonly ContactEmailInput[] | null;
  emails: EmailListItem[];
  onSelectEmail?: (email: EmailListItem) => void;
  selectedEmailId?: string | null;
  emptyMessage?: string;
  emptyHint?: string;
};

function emailRowKey(item: EmailListItem): string {
  return `${item.inboxId}:${item.id}`;
}

/**
 * Contact Emails workspace tab — status-grouped list of messages where this
 * contact sent or received (matched via Details email addresses / contactId).
 */
export function ContactEmailsListView({
  contactId,
  contactEmail = null,
  contactEmails = null,
  emails,
  onSelectEmail,
  selectedEmailId = null,
  emptyMessage = "No emails for this contact",
  emptyHint = "Messages this contact sent or received will show up here once their addresses are set in Details.",
}: ContactEmailsListViewProps) {
  const contact = useMemo(
    () => ({
      id: contactId,
      email: contactEmail,
      emails: contactEmails,
    }),
    [contactEmail, contactEmails, contactId],
  );

  const addressCount = useMemo(
    () => getContactEmailAddresses(contact).length,
    [contact],
  );

  const scopedEmails = useMemo(
    () =>
      emails.filter((item) =>
        emailMessageInvolvesContact(
          {
            from: item.from,
            to: item.to,
            contactId: item.contactId,
          },
          contact,
        ),
      ),
    [contact, emails],
  );

  const [localEmails, setLocalEmails] = useState(scopedEmails);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(() => new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  useEffect(() => {
    setLocalEmails(scopedEmails);
  }, [scopedEmails]);

  const groups = useMemo(
    () => groupEmailItemsByStatus(localEmails, { includeEmpty: true }),
    [localEmails],
  );

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.items })),
        collapsed,
        emailRowKey,
      ),
    [collapsed, groups],
  );

  const selectedRowKey = useMemo(() => {
    if (!selectedEmailId) return null;
    const match = localEmails.find((entry) => entry.id === selectedEmailId);
    return match ? emailRowKey(match) : null;
  }, [localEmails, selectedEmailId]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedRowKey,
    onNavigate: (rowKey) => {
      const item = localEmails.find((entry) => emailRowKey(entry) === rowKey);
      if (item) onSelectEmail?.(item);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  if (addressCount === 0 && scopedEmails.length === 0) {
    return (
      <div className="contact-tasks-list__empty">
        <h2 className="contact-tasks-list__empty-title">{emptyMessage}</h2>
        <p className="contact-tasks-list__empty-hint">
          Add email addresses in Details to match messages this contact sent or
          received.
        </p>
      </div>
    );
  }

  if (localEmails.length === 0) {
    return (
      <div className="contact-tasks-list__empty">
        <h2 className="contact-tasks-list__empty-title">{emptyMessage}</h2>
        <p className="contact-tasks-list__empty-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="contact-tasks-list-host" aria-label="Emails">
      <ul
        className="contact-tasks-list"
        role="list"
        ref={listRef}
        {...listContainerProps}
      >
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.status);
          return (
            <StatusGroupSection
              key={group.status}
              groupKey={group.status}
              title={group.label}
              collapsed={isCollapsed}
              icon={
                <TaskStatusIcon
                  status={group.status}
                  size={14}
                  title={group.label}
                />
              }
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.status)) next.delete(group.status);
                  else next.add(group.status);
                  return next;
                })
              }
            >
              {group.items.map((item) => {
                const key = emailRowKey(item);
                const active = selectedEmailId === item.id;
                const status = resolveEmailListItemStatus(item);
                const party =
                  formatEmailListPartyLabel(item.contactName, item.from) ||
                  parseReplyToAddress(item.from) ||
                  item.from;
                const displayId =
                  item.displayId?.trim() ||
                  (item.number != null ? `E-${item.number}` : null);

                return (
                  <li key={key} className="contact-emails-list__row">
                    <div
                      role="button"
                      tabIndex={0}
                      className={`${sidePanelItemClass({
                        active,
                        keyboardHighlighted: highlightedId === key,
                        stacked: true,
                      })} contact-emails-list__card`}
                      onClick={() => onSelectEmail?.(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectEmail?.(item);
                        }
                      }}
                      {...keyboardNavItemProps(key)}
                    >
                      <span className="contact-emails-list__primary">
                        <TaskStatusIcon status={status} size={14} />
                        {displayId ? (
                          <span className="contact-emails-list__id">
                            {displayId}
                          </span>
                        ) : null}
                        <span className="contact-emails-list__subject">
                          {item.subject.trim() || "(no subject)"}
                        </span>
                      </span>
                      <span className="contact-emails-list__meta">{party}</span>
                    </div>
                  </li>
                );
              })}
            </StatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
