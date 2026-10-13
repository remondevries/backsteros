import { isEmailInboxListContext, isEmailCommunicationListContext, isEmailPath } from "../email/email.js";
import { isJournalSectionPath } from "../journal/journal.js";
import {
  isContactSectionPath,
  isFinanceSectionPath,
  isKnowledgeSectionPath,
  isOrganizationSectionPath,
} from "../navigation/entity-routes.js";
import { isSocialSectionPath } from "../social/social-contacts.js";
import { isCommunicationSectionPath } from "../communication/communication.js";
import {
  isLettersSectionPath,
  isProjectLettersSectionPath,
} from "../letters/letters.js";
import { isProjectDocumentsSectionPath } from "../documents/should-handle-document-tree-create-folder-shortcut.js";

export { isEmailPath } from "../email/email.js";

export const INBOX_TASK_LIST_PANEL_WIDTH_KEY = "inbox-task-list-panel-width";
export const CALENDAR_TASK_LIST_PANEL_WIDTH_KEY = "calendar-task-list-panel-width";
export const EMAIL_LIST_PANEL_WIDTH_KEY = "email-list-panel-width";
export const JOURNAL_LIST_PANEL_WIDTH_KEY = "journal-list-panel-width";
export const KNOWLEDGE_LIST_PANEL_WIDTH_KEY = "knowledge-list-panel-width";
export const DOCUMENTS_LIST_PANEL_WIDTH_KEY = "documents-list-panel-width";
export const CONTACTS_LIST_PANEL_WIDTH_KEY = "contacts-list-panel-width";
export const ORGANIZATIONS_LIST_PANEL_WIDTH_KEY =
  "organizations-list-panel-width";
export const LETTERS_LIST_PANEL_WIDTH_KEY = "letters-list-panel-width";
export const FINANCE_LIST_PANEL_WIDTH_KEY = "finance-list-panel-width";
export const SOCIAL_LIST_PANEL_WIDTH_KEY = "social-list-panel-width";
export const COMMUNICATION_LIST_PANEL_WIDTH_KEY =
  "communication-list-panel-width";

/**
 * Routes that show the left content side panel (list + detail).
 * Email detail only keeps the panel when opened from Inbox or Communication.
 */
export function shouldShowContentSidePanel(
  pathname: string,
  search = "",
): boolean {
  return (
    pathname === "/inbox" ||
    pathname.startsWith("/inbox/") ||
    isCalendarListPath(pathname) ||
    (isEmailPath(pathname) &&
      (isEmailInboxListContext(search) ||
        isEmailCommunicationListContext(search))) ||
    isJournalSectionPath(pathname) ||
    isKnowledgeSectionPath(pathname) ||
    isLettersSectionPath(pathname) ||
    isContactSectionPath(pathname) ||
    isOrganizationSectionPath(pathname) ||
    isCommunicationSectionPath(pathname) ||
    isSocialSectionPath(pathname) ||
    isFinanceSectionPath(pathname) ||
    isProjectDocumentsSectionPath(pathname) ||
    isProjectLettersSectionPath(pathname)
  );
}

export function getContentSidePanelWidthKey(
  pathname: string,
  search = "",
): string {
  if (isProjectDocumentsSectionPath(pathname)) {
    return DOCUMENTS_LIST_PANEL_WIDTH_KEY;
  }
  if (isProjectLettersSectionPath(pathname)) {
    return LETTERS_LIST_PANEL_WIDTH_KEY;
  }
  if (isKnowledgeSectionPath(pathname)) {
    return KNOWLEDGE_LIST_PANEL_WIDTH_KEY;
  }
  if (isOrganizationSectionPath(pathname)) {
    return ORGANIZATIONS_LIST_PANEL_WIDTH_KEY;
  }
  if (isContactSectionPath(pathname)) {
    return CONTACTS_LIST_PANEL_WIDTH_KEY;
  }
  if (isSocialSectionPath(pathname)) {
    return SOCIAL_LIST_PANEL_WIDTH_KEY;
  }
  if (
    isCommunicationSectionPath(pathname) ||
    (isEmailPath(pathname) && isEmailCommunicationListContext(search))
  ) {
    return COMMUNICATION_LIST_PANEL_WIDTH_KEY;
  }
  if (isFinanceSectionPath(pathname)) {
    return FINANCE_LIST_PANEL_WIDTH_KEY;
  }
  if (isLettersSectionPath(pathname)) {
    return LETTERS_LIST_PANEL_WIDTH_KEY;
  }
  if (
    isJournalSectionPath(pathname)
  ) {
    return JOURNAL_LIST_PANEL_WIDTH_KEY;
  }
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) {
    return CALENDAR_TASK_LIST_PANEL_WIDTH_KEY;
  }
  if (isEmailPath(pathname)) {
    return INBOX_TASK_LIST_PANEL_WIDTH_KEY;
  }
  return INBOX_TASK_LIST_PANEL_WIDTH_KEY;
}

export function isInboxPath(pathname: string): boolean {
  return pathname === "/inbox" || pathname.startsWith("/inbox/");
}

export function isCalendarPath(pathname: string): boolean {
  return pathname === "/calendar" || pathname.startsWith("/calendar/");
}

/** Calendar main view with the unscheduled task list side panel. */
export function isCalendarListPath(pathname: string): boolean {
  return pathname === "/calendar";
}

/** Opened task detail scoped under Calendar — no list side panel. */
export function isCalendarTaskDetailPath(pathname: string): boolean {
  return pathname.startsWith("/calendar/tasks/");
}

/** Opened meeting detail scoped under Calendar — no list side panel. */
export function isCalendarMeetingDetailPath(pathname: string): boolean {
  return pathname.startsWith("/calendar/meetings/");
}

/**
 * True when the Inbox side panel should host the list.
 * Email routes only qualify when opened from Inbox (`?list=inbox`).
 */
export function isInboxPanelPath(pathname: string, search = ""): boolean {
  return (
    isInboxPath(pathname) ||
    (isEmailPath(pathname) && isEmailInboxListContext(search))
  );
}

/**
 * True when the Communication side panel should host the list.
 * Email routes qualify when opened from Communication (`?list=communication`).
 */
export function isCommunicationPanelPath(
  pathname: string,
  search = "",
): boolean {
  return (
    isCommunicationSectionPath(pathname) ||
    (isEmailPath(pathname) && isEmailCommunicationListContext(search))
  );
}

export function getSelectedInboxSlugFromPathname(
  pathname: string,
): string | null {
  if (!pathname.startsWith("/inbox/")) {
    return null;
  }
  const slug = pathname.slice("/inbox/".length).split("/")[0];
  return slug || null;
}
