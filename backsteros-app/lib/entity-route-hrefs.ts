import {
  encodeContactKeySlug,
  encodeContactSlug,
  encodeLetterSlug,
  encodeOrganizationKeySlug,
  encodeOrganizationSlug,
  encodeProjectSlug,
  encodeTaskSlug,
  normalizeEntityRouteParam,
  parseContactSlug,
  parseLetterSlug,
  parseOrganizationSlug,
} from "@/lib/entity-slugs";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";
import type { TasksDueFilter } from "@/lib/tasks-due-filters";

export function getCanonicalContactRouteParam(contact: {
  number?: number | null;
  key?: string;
  id?: string;
}) {
  if (contact.number != null) return encodeContactSlug(contact.number);
  if (contact.key) return encodeContactKeySlug(contact.key);
  return contact.id ?? "";
}

export function getCanonicalOrganizationRouteParam(organization: {
  number?: number | null;
  key?: string;
  id?: string;
}) {
  if (organization.number != null) {
    return encodeOrganizationSlug(organization.number);
  }
  if (organization.key) return encodeOrganizationKeySlug(organization.key);
  return organization.id ?? "";
}

export function getProjectHref(project: { key: string; id?: string }) {
  return `/projects/${encodeProjectSlug(project.key)}`;
}

export function getProjectHrefFromKey(projectKey: string) {
  return `/projects/${encodeProjectSlug(projectKey)}`;
}

export function getContactHref(contact: {
  number?: number | null;
  key?: string;
  id?: string;
}) {
  return `/contacts/${getCanonicalContactRouteParam(contact)}`;
}

export function getContactTaskHref(
  contact: { number?: number | null; key?: string },
  taskNumber: number,
) {
  const key = contact.key ?? getCanonicalContactRouteParam(contact);
  return `/contacts/${getCanonicalContactRouteParam(contact)}/tasks/${encodeTaskSlug(key, taskNumber)}`;
}

export function getDueTaskDetailHref(
  dueFilter: TasksDueFilter,
  contextKey: string,
  taskNumber: number,
) {
  return `/tasks/${dueFilter}/${encodeTaskSlug(contextKey, taskNumber)}`;
}

export function getContactHrefFromKey(
  contactKey: string,
  contactNumber?: number | null,
) {
  if (contactNumber != null) return getContactHref({ number: contactNumber });
  return `/contacts/${encodeContactKeySlug(contactKey)}`;
}

export function getOrganizationHref(organization: {
  number?: number | null;
  key?: string;
  id?: string;
}) {
  return `/organizations/${getCanonicalOrganizationRouteParam(organization)}`;
}

export function getOrganizationHrefFromKey(
  organizationKey: string,
  organizationNumber?: number | null,
) {
  if (organizationNumber != null) {
    return getOrganizationHref({ number: organizationNumber });
  }
  return `/organizations/${encodeOrganizationKeySlug(organizationKey)}`;
}

export function getInboxTaskRouteSlugForTask(input: {
  number: number;
  projectKey?: string | null;
  contactKey?: string | null;
}) {
  const contextKey = input.projectKey || input.contactKey || INBOX_TASK_KEY;
  return encodeTaskSlug(contextKey, input.number);
}

export function getInboxTaskRouteHref(input: {
  number: number;
  projectKey?: string | null;
  contactKey?: string | null;
}) {
  return `/inbox/${getInboxTaskRouteSlugForTask(input)}`;
}

export function getInboxTaskHref(taskNumber: number) {
  return getInboxTaskRouteHref({ number: taskNumber });
}

export function getProjectTaskHref(projectKey: string, taskNumber: number) {
  return `/projects/${encodeProjectSlug(projectKey)}/tasks/${encodeTaskSlug(projectKey, taskNumber)}`;
}

export function getContactTaskHrefFromKey(
  contactKey: string,
  taskNumber: number,
) {
  return `/contacts/${encodeContactKeySlug(contactKey)}/tasks/${encodeTaskSlug(contactKey, taskNumber)}`;
}

export function getProjectLetterHref(projectKey: string, letterNumber: number) {
  return `/projects/${encodeProjectSlug(projectKey)}/letters/${encodeLetterSlug(letterNumber)}`;
}

export function getLettersHref(letterNumber?: number | null) {
  if (letterNumber == null) return "/letters";
  return `/letters/${encodeLetterSlug(letterNumber)}`;
}

export function getTasksDueHref(filter: TasksDueFilter = "today") {
  return filter === "today" ? "/tasks" : `/tasks/${filter}`;
}

export function getTaskContextKeyFromParts(input: {
  projectKey?: string | null;
  contactKey?: string | null;
}) {
  return input.projectKey || input.contactKey || INBOX_TASK_KEY;
}

export function contactRouteParamMatchesLegacyKey(
  routeParam: string,
  contactKey: string,
): boolean {
  return (
    encodeContactKeySlug(contactKey) === normalizeEntityRouteParam(routeParam)
  );
}

export function organizationRouteParamMatchesLegacyKey(
  routeParam: string,
  organizationKey: string,
): boolean {
  return (
    encodeOrganizationKeySlug(organizationKey) ===
    normalizeEntityRouteParam(routeParam)
  );
}

export function contactMatchesRouteSlug(
  contact: { number?: number | null; key?: string; id?: string },
  routeSlug: string | null | undefined,
): boolean {
  if (!routeSlug) return false;

  const normalized = normalizeEntityRouteParam(routeSlug);
  if (contact.id && contact.id === routeSlug) return true;

  const contactNumber =
    contact.number == null ? null : Number(contact.number);
  if (contactNumber != null && Number.isFinite(contactNumber)) {
    if (encodeContactSlug(contactNumber) === normalized) return true;
    if (String(contactNumber) === normalized) return true;
    if (parseContactSlug(routeSlug) === contactNumber) return true;
  }

  if (contact.key) {
    return contactRouteParamMatchesLegacyKey(routeSlug, contact.key);
  }

  return false;
}

export function organizationMatchesRouteSlug(
  organization: { number?: number | null; key?: string; id?: string },
  routeSlug: string | null | undefined,
): boolean {
  if (!routeSlug) return false;

  const normalized = normalizeEntityRouteParam(routeSlug);
  if (organization.id && organization.id === routeSlug) return true;

  const organizationNumber =
    organization.number == null ? null : Number(organization.number);
  if (organizationNumber != null && Number.isFinite(organizationNumber)) {
    if (encodeOrganizationSlug(organizationNumber) === normalized) return true;
    if (String(organizationNumber) === normalized) return true;
    if (parseOrganizationSlug(routeSlug) === organizationNumber) return true;
  }

  if (organization.key) {
    return organizationRouteParamMatchesLegacyKey(routeSlug, organization.key);
  }

  return false;
}

export function letterMatchesRouteSlug(
  letter: { number?: number | null; id?: string },
  routeSlug: string | null | undefined,
): boolean {
  if (!routeSlug) return false;
  if (letter.id && letter.id === routeSlug) return true;

  const letterNumber = letter.number == null ? null : Number(letter.number);
  if (letterNumber == null || !Number.isFinite(letterNumber)) return false;

  const normalized = normalizeEntityRouteParam(routeSlug);
  if (encodeLetterSlug(letterNumber) === normalized) return true;
  if (String(letterNumber) === normalized) return true;
  return parseLetterSlug(routeSlug) === letterNumber;
}
