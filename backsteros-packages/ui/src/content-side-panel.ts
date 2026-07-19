import { isJournalSectionPath } from "./journal.js";
import {
  isContactSectionPath,
  isKnowledgeSectionPath,
  isOrganizationSectionPath,
} from "./entity-routes.js";
import {
  isLettersSectionPath,
  isProjectLettersSectionPath,
} from "./letters.js";
import { isProjectDocumentsSectionPath } from "./should-handle-document-tree-create-folder-shortcut.js";

export const INBOX_TASK_LIST_PANEL_WIDTH_KEY = "inbox-task-list-panel-width";
export const JOURNAL_LIST_PANEL_WIDTH_KEY = "journal-list-panel-width";
export const KNOWLEDGE_LIST_PANEL_WIDTH_KEY = "knowledge-list-panel-width";
export const DOCUMENTS_LIST_PANEL_WIDTH_KEY = "documents-list-panel-width";
export const CONTACTS_LIST_PANEL_WIDTH_KEY = "contacts-list-panel-width";
export const ORGANIZATIONS_LIST_PANEL_WIDTH_KEY =
  "organizations-list-panel-width";
export const LETTERS_LIST_PANEL_WIDTH_KEY = "letters-list-panel-width";

/** Routes that show the left content side panel (list + detail). */
export function shouldShowContentSidePanel(pathname: string): boolean {
  return (
    pathname === "/inbox" ||
    pathname.startsWith("/inbox/") ||
    isJournalSectionPath(pathname) ||
    isKnowledgeSectionPath(pathname) ||
    isLettersSectionPath(pathname) ||
    isContactSectionPath(pathname) ||
    isOrganizationSectionPath(pathname) ||
    isProjectDocumentsSectionPath(pathname) ||
    isProjectLettersSectionPath(pathname)
  );
}

export function getContentSidePanelWidthKey(pathname: string): string {
  if (isProjectDocumentsSectionPath(pathname)) {
    return DOCUMENTS_LIST_PANEL_WIDTH_KEY;
  }
  if (isProjectLettersSectionPath(pathname)) {
    return LETTERS_LIST_PANEL_WIDTH_KEY;
  }
  if (isKnowledgeSectionPath(pathname)) {
    return KNOWLEDGE_LIST_PANEL_WIDTH_KEY;
  }
  if (isContactSectionPath(pathname)) {
    return CONTACTS_LIST_PANEL_WIDTH_KEY;
  }
  if (isOrganizationSectionPath(pathname)) {
    return ORGANIZATIONS_LIST_PANEL_WIDTH_KEY;
  }
  if (isLettersSectionPath(pathname)) {
    return LETTERS_LIST_PANEL_WIDTH_KEY;
  }
  if (isJournalSectionPath(pathname)) {
    return JOURNAL_LIST_PANEL_WIDTH_KEY;
  }
  return INBOX_TASK_LIST_PANEL_WIDTH_KEY;
}

export function isInboxPath(pathname: string): boolean {
  return pathname === "/inbox" || pathname.startsWith("/inbox/");
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
