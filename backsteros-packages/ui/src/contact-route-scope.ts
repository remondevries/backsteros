import {
  getContactSectionHref,
  getContactSectionSegment,
  type ContactSectionId,
} from "./contact-sections.js";
import { getContactsHref } from "./entity-routes.js";
import { encodeTaskSlug } from "./inbox-items.js";
import { formatLetterDisplayId } from "./letters.js";
import { INBOX_TASK_KEY } from "./task-display-id.js";

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
