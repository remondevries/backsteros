import { CONTACT_DISPLAY_KEY } from "@/lib/contact-display-id";
import { LETTER_DISPLAY_KEY } from "@/lib/letter-display-id";
import { ORGANIZATION_DISPLAY_KEY } from "@/lib/organization-display-id";
import { normalizeProjectKey } from "@/lib/project-key";
import { INBOX_TASK_KEY } from "@/lib/task-display-id";

export const ENTITY_ROUTE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEntityRouteUuid(value: string): boolean {
  return ENTITY_ROUTE_UUID_PATTERN.test(value.trim());
}

export function encodeProjectSlug(key: string): string {
  return normalizeProjectKey(key).toLowerCase();
}

export function normalizeEntityRouteParam(segment: string): string {
  return decodeURIComponent(segment).trim().toLowerCase();
}

export function encodeContactSlug(contactNumber: number): string {
  return `${CONTACT_DISPLAY_KEY}-${contactNumber}`.toLowerCase();
}

export function encodeOrganizationSlug(organizationNumber: number): string {
  return `${ORGANIZATION_DISPLAY_KEY}-${organizationNumber}`.toLowerCase();
}

export function encodeContactKeySlug(key: string): string {
  return normalizeProjectKey(key).toLowerCase();
}

export function encodeOrganizationKeySlug(key: string): string {
  return normalizeProjectKey(key).toLowerCase();
}

export function encodeTaskSlug(contextKey: string, taskNumber: number): string {
  return `${normalizeProjectKey(contextKey)}-${taskNumber}`.toLowerCase();
}

export function encodeLetterSlug(letterNumber: number): string {
  return `${LETTER_DISPLAY_KEY}-${letterNumber}`.toLowerCase();
}

export function parseTaskSlug(
  slug: string,
): { contextKey: string; number: number } | null {
  const trimmed = slug.trim();
  const match = trimmed.match(/^([a-z0-9]+)-(\d+)$/i);
  if (!match) {
    return null;
  }

  const number = Number(match[2]);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return {
    contextKey: normalizeProjectKey(match[1]!),
    number,
  };
}

export function parseLetterSlug(slug: string): number | null {
  const trimmed = slug.trim();
  const match = trimmed.match(/^l-(\d+)$/i);
  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return number;
}

export function parseContactSlug(slug: string): number | null {
  const trimmed = slug.trim();
  const match = trimmed.match(/^c-(\d+)$/i);
  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return number;
}

export function parseOrganizationSlug(slug: string): number | null {
  const trimmed = slug.trim();
  const match = trimmed.match(/^o-(\d+)$/i);
  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return number;
}

export function getInboxTaskRouteSlug(taskNumber: number): string {
  return encodeTaskSlug(INBOX_TASK_KEY, taskNumber);
}

export type TaskRouteSlugInput = {
  number: number;
  contextKey: string;
};

export function getTaskRouteSlug(input: TaskRouteSlugInput): string {
  return encodeTaskSlug(input.contextKey, input.number);
}

export function taskMatchesRouteSlug(
  task: { number: number },
  routeSlug: string | null | undefined,
  contextKey: string,
): boolean {
  if (!routeSlug) {
    return false;
  }

  return (
    getTaskRouteSlug({ number: task.number, contextKey }) ===
    routeSlug.toLowerCase()
  );
}
