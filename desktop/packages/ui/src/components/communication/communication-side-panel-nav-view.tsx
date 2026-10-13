"use client";

import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import { useMemo } from "react";
import { CommentDiscussionIcon, CommentIcon } from "@primer/octicons-react";

import {
  COMMUNICATION_LIST_FILTER_OPTIONS,
  getCommunicationChannelHref,
  resolveActiveCommunicationChannel,
  resolveActiveCommunicationInboxId,
  type CommunicationListFilter,
} from "../../communication/communication.js";
import {
  emailMailboxLabel,
  type EmailMailbox,
} from "../../email/email.js";
import {
  keyboardNavItemClass,
  keyboardNavItemProps,
} from "../../list-nav/keyboard-nav-item.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";
import {
  CommunicationNavIcon,
  EmailNavIcon,
} from "../shell/sidebar-nav-icons.js";

export type CommunicationSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}>;

const COMMUNICATION_INBOX_KEYBOARD_PREFIX = "inbox:";

export function communicationSidePanelInboxKeyboardId(inboxId: string): string {
  return `${COMMUNICATION_INBOX_KEYBOARD_PREFIX}${inboxId}`;
}

export function parseCommunicationSidePanelKeyboardId(itemId: string): {
  kind: "channel" | "inbox";
  value: string;
} {
  if (itemId.startsWith(COMMUNICATION_INBOX_KEYBOARD_PREFIX)) {
    return {
      kind: "inbox",
      value: itemId.slice(COMMUNICATION_INBOX_KEYBOARD_PREFIX.length),
    };
  }
  return { kind: "channel", value: itemId };
}

export function resolveCommunicationSidePanelHref(itemId: string): string | null {
  const parsed = parseCommunicationSidePanelKeyboardId(itemId);
  if (parsed.kind === "inbox") {
    return getCommunicationChannelHref("email", { inboxId: parsed.value });
  }
  if (
    (COMMUNICATION_LIST_FILTER_OPTIONS as ReadonlyArray<{ value: string }>).some(
      (option) => option.value === parsed.value,
    )
  ) {
    return getCommunicationChannelHref(
      parsed.value as CommunicationListFilter,
    );
  }
  return null;
}

/** Dedupe by inbox id — AgentMail can surface the same mailbox more than once. */
export function uniqueCommunicationSidePanelMailboxes(
  mailboxes: readonly EmailMailbox[],
): EmailMailbox[] {
  const seen = new Set<string>();
  const unique: EmailMailbox[] = [];
  for (const mailbox of mailboxes) {
    const id = mailbox.inboxId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(mailbox);
  }
  return unique;
}

/**
 * j/k order must match the rendered tree: channels with Email mailboxes
 * nested under Email (not appended after Support).
 */
export function buildCommunicationSidePanelKeyboardItemIds(
  mailboxes: readonly EmailMailbox[],
  options?: { emailExpanded?: boolean },
): string[] {
  const emailExpanded = options?.emailExpanded !== false;
  const ids: string[] = [];
  for (const option of COMMUNICATION_LIST_FILTER_OPTIONS) {
    ids.push(option.value);
    if (option.value === "email" && emailExpanded) {
      for (const mailbox of uniqueCommunicationSidePanelMailboxes(mailboxes)) {
        ids.push(communicationSidePanelInboxKeyboardId(mailbox.inboxId));
      }
    }
  }
  return ids;
}

const EMAIL_ACCOUNTS_EXPANDED_STORAGE_KEY =
  "backsteros.communication.email-accounts-expanded";

export function readCommunicationEmailAccountsExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(EMAIL_ACCOUNTS_EXPANDED_STORAGE_KEY);
    if (raw == null) return true;
    return raw !== "0" && raw !== "false";
  } catch {
    return true;
  }
}

export function writeCommunicationEmailAccountsExpanded(expanded: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      EMAIL_ACCOUNTS_EXPANDED_STORAGE_KEY,
      expanded ? "1" : "0",
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export type CommunicationSidePanelNavViewProps = {
  pathname: string;
  search?: string;
  Link: CommunicationSidePanelLinkComponent;
  /** AgentMail inboxes — nested under Email. */
  mailboxes?: readonly EmailMailbox[];
  /** Whether Email mailbox accounts are expanded. */
  emailAccountsExpanded?: boolean;
  onEmailAccountsExpandedChange?: (expanded: boolean) => void;
  onComposeEmail?: () => void;
  highlightedId?: string | null;
  listRef?: Ref<HTMLElement>;
  listContainerProps?: HTMLAttributes<HTMLElement>;
};

function WhatsAppNavIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12.04 2c-5.46 0-9.91 4.43-9.91 9.9 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.9-4.43 9.9-9.91C21.94 6.43 17.5 2 12.04 2m0 18.14c-1.48 0-2.93-.4-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 4.53 0 8.24 3.7 8.24 8.24 0 4.54-3.71 8.24-8.24 8.24m4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74 2.49 1.07 2.49.71 2.94.67.45-.04 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.17-.47-.29" />
    </svg>
  );
}

function ChannelIcon({
  channel,
}: {
  channel: CommunicationListFilter;
}) {
  const props = { size: 16, className: "nav-icon" } as const;
  switch (channel) {
    case "email":
      return <EmailNavIcon {...props} />;
    case "whatsapp":
      return <WhatsAppNavIcon {...props} />;
    case "chat":
      return <CommentIcon {...props} />;
    case "support":
      return <CommentDiscussionIcon {...props} />;
    default:
      return <CommunicationNavIcon {...props} />;
  }
}

/**
 * Everything / Email (+ mailboxes) / WhatsApp / Chat / Support.
 * Item list lives in main content.
 */
export function CommunicationSidePanelNavView({
  pathname,
  search = "",
  Link,
  mailboxes = [],
  emailAccountsExpanded = true,
  onEmailAccountsExpandedChange,
  onComposeEmail,
  highlightedId = null,
  listRef,
  listContainerProps,
}: CommunicationSidePanelNavViewProps) {
  const activeChannel = resolveActiveCommunicationChannel({ pathname, search });
  const activeInboxId = resolveActiveCommunicationInboxId({ pathname, search });
  const emailChannelActive = activeChannel === "email";
  const uniqueMailboxes = useMemo(
    () => uniqueCommunicationSidePanelMailboxes(mailboxes),
    [mailboxes],
  );
  const showEmailAccounts =
    emailAccountsExpanded && uniqueMailboxes.length > 0;

  return (
    <div className="app-content-side-panel communication-side-panel-nav">
      <ContentSidePanelHeader
        title="Communication"
        actions={
          onComposeEmail ? (
            <button
              type="button"
              className="app-side-panel-section-action"
              title="Compose e-mail"
              aria-label="Compose e-mail"
              onClick={onComposeEmail}
            >
              <SidePanelPlusIcon />
            </button>
          ) : null
        }
      />
      <nav
        aria-label="Communication channels"
        className="app-side-panel-scroll"
        ref={listRef as Ref<HTMLElement>}
        {...listContainerProps}
      >
        <ul className="app-side-panel-list">
          {COMMUNICATION_LIST_FILTER_OPTIONS.map((option) => {
            const href = getCommunicationChannelHref(option.value);
            const isEmail = option.value === "email";
            const active =
              activeChannel === option.value &&
              (!isEmail || activeInboxId == null);
            const keyboardHighlighted = highlightedId === option.value;
            const itemClassName = [
              "app-side-panel-item",
              active ? "app-side-panel-item-active" : null,
              isEmail && emailChannelActive && activeInboxId != null
                ? "communication-side-panel-nav__channel-ancestor"
                : null,
              keyboardNavItemClass(keyboardHighlighted),
            ]
              .filter(Boolean)
              .join(" ");

            if (isEmail && uniqueMailboxes.length > 0) {
              return (
                <li
                  key={option.value}
                  className="communication-side-panel-nav__channel-with-children"
                >
                  <div className="communication-side-panel-nav__email-row">
                    <span className="communication-side-panel-nav__email-toggle-slot">
                      <button
                        type="button"
                        className="communication-side-panel-nav__email-toggle"
                        aria-expanded={emailAccountsExpanded}
                        aria-label={
                          emailAccountsExpanded
                            ? "Collapse email accounts"
                            : "Expand email accounts"
                        }
                        title={
                          emailAccountsExpanded
                            ? "Collapse email accounts"
                            : "Expand email accounts"
                        }
                        onClick={() =>
                          onEmailAccountsExpandedChange?.(
                            !emailAccountsExpanded,
                          )
                        }
                      >
                        <span
                          className="communication-side-panel-nav__email-toggle-icon"
                          aria-hidden="true"
                        >
                          <EmailNavIcon size={16} className="nav-icon" />
                        </span>
                        <span
                          className="communication-side-panel-nav__email-toggle-chevron"
                          data-expanded={emailAccountsExpanded}
                          aria-hidden="true"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            aria-hidden="true"
                          >
                            <path
                              d="M9 6l6 6-6 6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </button>
                    </span>
                    <Link
                      to={href}
                      aria-current={active ? "page" : undefined}
                      className={itemClassName}
                      {...keyboardNavItemProps(option.value)}
                    >
                      <span className="app-side-panel-item-label">
                        {option.label}
                      </span>
                    </Link>
                  </div>
                  {showEmailAccounts ? (
                    <ul
                      className="communication-side-panel-nav__mailbox-list"
                      aria-label="Email accounts"
                    >
                      {uniqueMailboxes.map((mailbox) => {
                        const mailboxHref = getCommunicationChannelHref(
                          "email",
                          { inboxId: mailbox.inboxId },
                        );
                        const itemId = communicationSidePanelInboxKeyboardId(
                          mailbox.inboxId,
                        );
                        const mailboxActive =
                          emailChannelActive &&
                          activeInboxId === mailbox.inboxId;
                        const label =
                          mailbox.email.trim() || emailMailboxLabel(mailbox);
                        const mailboxHighlighted = highlightedId === itemId;
                        return (
                          <li key={mailbox.inboxId}>
                            <Link
                              to={mailboxHref}
                              aria-current={
                                mailboxActive ? "page" : undefined
                              }
                              title={emailMailboxLabel(mailbox)}
                              className={[
                                "app-side-panel-item",
                                "communication-side-panel-nav__mailbox-item",
                                mailboxActive
                                  ? "app-side-panel-item-active"
                                  : null,
                                keyboardNavItemClass(mailboxHighlighted),
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              {...keyboardNavItemProps(itemId)}
                            >
                              <span className="app-side-panel-item-label">
                                {label}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            }

            return (
              <li key={option.value}>
                <Link
                  to={href}
                  aria-current={active ? "page" : undefined}
                  className={itemClassName}
                  {...keyboardNavItemProps(option.value)}
                >
                  <ChannelIcon channel={option.value} />
                  <span className="app-side-panel-item-label">
                    {option.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
