import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "./task-status.js";

export const LETTER_DISPLAY_KEY = "L";

export function formatLetterDisplayId(letterNumber: number): string {
  return `${LETTER_DISPLAY_KEY}-${letterNumber}`;
}

export type LetterListItem = {
  id: string;
  title: string;
  number: number;
  status: string;
  sortOrder?: number;
  projectId?: string | null;
  projectKey?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
  dueDate?: number | Date | null;
};

export type LetterStatusGroup<T extends LetterListItem = LetterListItem> = {
  status: TaskStatus;
  label: string;
  letters: T[];
};

export function groupLettersByStatus<T extends LetterListItem>(
  letters: readonly T[],
  options?: { includeEmpty?: boolean },
): LetterStatusGroup<T>[] {
  const buckets = new Map<TaskStatus, T[]>();
  for (const status of TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const letter of letters) {
    const status = migrateLegacyTaskStatus(letter.status);
    buckets.get(status)?.push(letter);
  }

  const groups = TASK_STATUS_ORDER.map((status) => ({
    status,
    label: getTaskStatusLabel(status),
    letters: (buckets.get(status) ?? []).sort(
      (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    ),
  }));

  return options?.includeEmpty
    ? groups
    : groups.filter((group) => group.letters.length > 0);
}

/** First letter as shown in status-grouped side panel lists. */
export function getFirstLetterInListOrder<T extends LetterListItem>(
  letters: readonly T[],
): T | undefined {
  for (const group of groupLettersByStatus(letters)) {
    if (group.letters.length > 0) {
      return group.letters[0];
    }
  }
  return undefined;
}

export function getLettersHref(letterNumber?: number | null): string {
  if (letterNumber == null) return "/letters";
  return `/letters/${LETTER_DISPLAY_KEY.toLowerCase()}-${letterNumber}`;
}

export function getSelectedLetterSlugFromPathname(
  pathname: string,
): string | null {
  const projectMatch = pathname.match(/\/projects\/[^/]+\/letters\/([^/]+)/);
  if (projectMatch?.[1]) {
    const slug = decodeURIComponent(projectMatch[1]);
    if (slug === "new" || slug === "compose") return null;
    return slug;
  }

  const contactMatch = pathname.match(
    /(?:^\/contacts\/[^/]+|\/organizations\/[^/]+\/contacts\/[^/]+)\/letters\/([^/]+)/,
  );
  if (contactMatch?.[1]) {
    const slug = decodeURIComponent(contactMatch[1]);
    if (slug === "new" || slug === "compose") return null;
    return slug;
  }

  if (!pathname.startsWith("/letters/")) return null;
  const slug = pathname.slice("/letters/".length).split("/")[0];
  if (!slug || slug === "new" || slug === "compose") return null;
  return decodeURIComponent(slug);
}

const PROJECT_LETTERS_PATH =
  /^\/(?:projects\/[^/]+|organizations\/[^/]+\/projects\/[^/]+)\/letters/;

export function isProjectLettersSectionPath(pathname: string): boolean {
  return PROJECT_LETTERS_PATH.test(pathname);
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

export function isLettersSectionPath(pathname: string): boolean {
  return pathname === "/letters" || pathname.startsWith("/letters/");
}

function isLetterComposePath(pathname: string): boolean {
  return (
    pathname === "/letters/new" ||
    pathname === "/letters/compose" ||
    /\/letters\/(new|compose)$/.test(pathname)
  );
}

/**
 * Strip the product web basePath (`/app`) so letter/route helpers work in
 * production Next (`basePath: /app`) and desktop (no prefix) alike.
 */
export function normalizeProductPathname(pathname: string): string {
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return pathname.slice("/app".length) || "/";
  }
  return pathname;
}

/** True on letter detail routes (not compose) — used for letter-specific shortcuts. */
export function isLetterDetailPath(pathname: string): boolean {
  const path = normalizeProductPathname(pathname);
  return (
    (/^\/letters\/[^/]+$/.test(path) && !isLetterComposePath(path)) ||
    /^\/projects\/[^/]+\/letters\/[^/]+$/.test(path) ||
    /^\/organizations\/[^/]+\/letters\/[^/]+$/.test(path) ||
    /^\/contacts\/[^/]+\/letters\/[^/]+$/.test(path) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/letters\/[^/]+$/.test(path) ||
    /^\/organizations\/[^/]+\/projects\/[^/]+\/letters\/[^/]+$/.test(path)
  );
}

export function letterMatchesSlug(
  letter: Pick<LetterListItem, "id" | "number">,
  slug: string | null,
): boolean {
  if (!slug) return false;
  if (letter.id === slug) return true;
  const display = formatLetterDisplayId(letter.number).toLowerCase();
  return slug.toLowerCase() === display || slug.toLowerCase() === `l-${letter.number}`;
}
