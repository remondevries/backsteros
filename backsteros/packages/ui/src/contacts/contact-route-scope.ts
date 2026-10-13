import {
  getContactSectionHref,
  getContactSectionSegment,
  type ContactSectionId,
} from "./contact-sections.js";
import { getContactsHref } from "../navigation/entity-routes.js";
import { encodeTaskSlug } from "../inbox/inbox-items.js";
import { formatLetterDisplayId } from "../letters/letters.js";
import { formatMeetingDisplayId } from "../meetings/meetings.js";
import { INBOX_TASK_KEY } from "../tasks/task-display-id.js";

export type ContactRouteScope =
  | { kind: "standalone" }
  | { kind: "organization"; organizationRouteParam: string };

export function parseOrganizationContactRoute(
  pathname: string,
): { organizationRouteParam: string; contactRouteParam: string } | null {
  const match = pathname.match(/^\/organizations\/([^/]+)\/contacts\/([^/]+)/);
  if (!match || match[2] === "new") {
    return null;
  }

  return {
    organizationRouteParam: decodeURIComponent(match[1]!),
    contactRouteParam: decodeURIComponent(match[2]!),
  };
}

export function isOrganizationContactDetailPath(pathname: string): boolean {
  return /^\/organizations\/[^/]+\/contacts\/[^/]+(?:\/|$)/.test(pathname);
}

export function getContactRouteScopeFromPathname(
  pathname: string,
): ContactRouteScope {
  const orgContact = parseOrganizationContactRoute(pathname);
  if (orgContact) {
    return {
      kind: "organization",
      organizationRouteParam: orgContact.organizationRouteParam,
    };
  }

  return { kind: "standalone" };
}

export function getScopedContactBasePath(
  contactRouteParam: string,
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "organization") {
    return `/organizations/${encodeURIComponent(scope.organizationRouteParam)}/contacts/${encodeURIComponent(contactRouteParam)}`;
  }

  return `/contacts/${encodeURIComponent(contactRouteParam)}`;
}

export function getOrganizationContactHref(
  organizationRouteParam: string,
  contact: { number?: number | null; key?: string | null; id?: string },
): string {
  const contactRouteParam =
    contact.number != null
      ? String(contact.number)
      : (contact.key ?? contact.id ?? "");
  return getScopedContactBasePath(contactRouteParam, {
    kind: "organization",
    organizationRouteParam,
  });
}

export function getScopedContactSectionHref(
  contactRouteParam: string,
  sectionId: ContactSectionId = "overview",
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "standalone") {
    return getContactSectionHref(contactRouteParam, sectionId);
  }

  const base = getScopedContactBasePath(contactRouteParam, scope);
  const segment = getContactSectionSegment(sectionId);
  return segment ? `${base}/${segment}` : base;
}

export function getScopedContactsListHref(
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  if (scope.kind === "organization") {
    return `/organizations/${encodeURIComponent(scope.organizationRouteParam)}/contacts`;
  }
  return getContactsHref();
}

export function getScopedContactTaskHref(
  task: {
    projectId: string | null;
    contactId?: string | null;
    number: number;
    projectKey?: string | null;
  },
  contact: { id: string; key?: string | null },
  projects: readonly { id: string; key: string }[],
  scope: ContactRouteScope = { kind: "standalone" },
  contactRouteParam?: string,
): string {
  const routeParam = contactRouteParam ?? (contact.key ? contact.key : contact.id);
  const base = `${getScopedContactBasePath(routeParam, scope)}/tasks`;
  const contactKey = contact.key ?? contact.id;

  if (task.projectId) {
    const project =
      projects.find((entry) => entry.id === task.projectId) ??
      (task.projectKey
        ? { id: task.projectId, key: task.projectKey }
        : null);
    if (project) {
      return `${base}/${encodeTaskSlug(project.key, task.number)}`;
    }
  }

  if (task.contactId === contact.id) {
    return `${base}/${encodeTaskSlug(contactKey, task.number)}`;
  }

  if (task.projectKey) {
    return `${base}/${encodeTaskSlug(task.projectKey, task.number)}`;
  }

  return `${base}/${encodeTaskSlug(INBOX_TASK_KEY, task.number)}`;
}

export function getScopedContactLetterHref(
  contactRouteParam: string,
  letterNumberOrNew: number | "new",
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  const base = getScopedContactSectionHref(contactRouteParam, "letters", scope);
  if (letterNumberOrNew === "new") {
    return `${base}/new`;
  }
  return `${base}/${formatLetterDisplayId(letterNumberOrNew).toLowerCase()}`;
}

/** Contact meetings list root — redirects into the expanded workspace Meetings tab. */
export function getScopedContactMeetingsListHref(
  contactRouteParam: string,
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  return `${getScopedContactBasePath(contactRouteParam, scope)}/meetings`;
}

export function getScopedContactMeetingHref(
  contactRouteParam: string,
  meetingIdOrNumber: string | number,
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  const base = getScopedContactMeetingsListHref(contactRouteParam, scope);
  if (typeof meetingIdOrNumber === "number") {
    return `${base}/${formatMeetingDisplayId(meetingIdOrNumber).toLowerCase()}`;
  }
  return `${base}/${encodeURIComponent(meetingIdOrNumber)}`;
}

/** Emails list root under a contact (expanded workspace Emails tab). */
export function getScopedContactEmailsListHref(
  contactRouteParam: string,
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  return `${getScopedContactBasePath(contactRouteParam, scope)}/emails`;
}

export function getScopedContactEmailHref(
  contactRouteParam: string,
  item: { kind?: string; inboxId: string; id: string },
  scope: ContactRouteScope = { kind: "standalone" },
): string {
  const base = getScopedContactEmailsListHref(contactRouteParam, scope);
  const inbox = encodeURIComponent(item.inboxId);
  const id = encodeURIComponent(item.id);
  if (item.kind === "draft") {
    return `${base}/${inbox}/drafts/${id}`;
  }
  return `${base}/${inbox}/${id}`;
}

export type ContactScopedEntityDetail =
  | { kind: "meetings"; id: string }
  | { kind: "tasks"; id: string }
  | { kind: "letters"; id: string }
  | {
      kind: "emails";
      inboxId: string;
      messageId?: string;
      draftId?: string;
    };

const CONTACT_SCOPED_ENTITY_DETAIL_RE =
  /^(?:\/organizations\/[^/]+)?\/contacts\/[^/]+\/(tasks|letters|meetings)\/([^/]+)\/?$/;
const CONTACT_SCOPED_EMAIL_DETAIL_RE =
  /^(?:\/organizations\/[^/]+)?\/contacts\/[^/]+\/emails\/([^/]+)\/(?:drafts\/)?([^/]+)\/?$/;

/**
 * Nested task / letter / meeting / email detail under a contact.
 * Standalone contacts embed these in the expanded workspace middle column.
 */
export function parseContactScopedEntityDetail(
  pathname: string,
): ContactScopedEntityDetail | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const emailMatch = normalized.match(CONTACT_SCOPED_EMAIL_DETAIL_RE);
  if (emailMatch) {
    const inboxId = decodeURIComponent(emailMatch[1]!);
    const id = decodeURIComponent(emailMatch[2]!);
    if (normalized.includes("/drafts/")) {
      return { kind: "emails", inboxId, draftId: id };
    }
    return { kind: "emails", inboxId, messageId: id };
  }
  const match = normalized.match(CONTACT_SCOPED_ENTITY_DETAIL_RE);
  if (!match) return null;
  const kind = match[1] as "tasks" | "letters" | "meetings";
  return { kind, id: decodeURIComponent(match[2]!) };
}

export function isContactScopedEntityDetailPath(pathname: string): boolean {
  return parseContactScopedEntityDetail(pathname) != null;
}
