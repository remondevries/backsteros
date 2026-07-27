import { isProjectDocumentsSectionPath } from "@/lib/document-navigation-path";
import { isContactSectionPath } from "@/lib/contacts/navigation-path";
import { isJournalSectionPath } from "@/lib/journal/navigation-path";
import { isKnowledgeSectionPath } from "@/lib/knowledge/navigation-path";
import {
  isLettersSectionPath,
  isProjectLettersSectionPath,
} from "@/lib/letters/navigation-path";
import { isOrganizationSectionPath } from "@/lib/organizations/navigation-path";
import { isSettingsPath } from "@/lib/settings/tabs";

export const INBOX_TASK_LIST_PANEL_WIDTH_KEY = "inbox-task-list-panel-width";

export const KNOWLEDGE_LIST_PANEL_WIDTH_KEY = "knowledge-list-panel-width";

export const DOCUMENTS_LIST_PANEL_WIDTH_KEY = "documents-list-panel-width";

export const JOURNAL_LIST_PANEL_WIDTH_KEY = "journal-list-panel-width";

export const CONTACTS_LIST_PANEL_WIDTH_KEY = "contacts-list-panel-width";

export const ORGANIZATIONS_LIST_PANEL_WIDTH_KEY = "organizations-list-panel-width";

export const LETTERS_LIST_PANEL_WIDTH_KEY = "letters-list-panel-width";

export const COMPOSE_DOCUMENT_EDIT_PARAM = "edit";
export const COMPOSE_DOCUMENT_EDIT_VALUE = "1";

export function appendComposeDocumentViewQuery(href: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${COMPOSE_DOCUMENT_EDIT_PARAM}=${COMPOSE_DOCUMENT_EDIT_VALUE}`;
}

export function shouldShowContentSidePanel(pathname: string): boolean {
  if (isSettingsPath(pathname)) {
    return false;
  }

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
