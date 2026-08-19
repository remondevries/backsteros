const JOURNAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Path segments under /journal that are pages, not date slugs. */
export const JOURNAL_RESERVED_SLUGS = new Set(["habits"]);

export function isJournalReservedSlug(value: string): boolean {
  return JOURNAL_RESERVED_SLUGS.has(value);
}

export function formatJournalDateSlug(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayJournalDateSlug(): string {
  return formatJournalDateSlug(new Date());
}

export function isValidJournalDateSlug(value: string): boolean {
  if (!JOURNAL_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month! - 1 &&
    date.getDate() === day
  );
}

export function parseJournalDateSlug(value: string): Date | null {
  if (!isValidJournalDateSlug(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

export function formatJournalEntryTitle(dateSlug: string): string {
  const date = parseJournalDateSlug(dateSlug);
  if (!date) {
    return dateSlug;
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Side-panel / file-style label — always the canonical `YYYY-MM-DD` slug. */
export function formatJournalSidePanelLabel(dateSlug: string): string {
  return dateSlug;
}

export function getJournalHref(dateSlug?: string): string {
  if (!dateSlug) {
    return "/journal";
  }

  return `/journal/${dateSlug}`;
}

export function getSelectedJournalDateFromPathname(
  pathname: string,
): string | undefined {
  const match = pathname.match(/^\/journal\/([^/]+)(?:\/|$)/);
  if (!match) {
    return undefined;
  }

  const slug = decodeURIComponent(match[1]!);
  if (isJournalReservedSlug(slug) || !isValidJournalDateSlug(slug)) {
    return undefined;
  }

  return slug;
}

export function isJournalDetailPath(pathname: string): boolean {
  const match = pathname.match(/^\/journal\/([^/]+)$/);
  if (!match) return false;
  const slug = decodeURIComponent(match[1]!);
  return !isJournalReservedSlug(slug) && isValidJournalDateSlug(slug);
}

export function isJournalSectionPath(pathname: string): boolean {
  return pathname === "/journal" || pathname.startsWith("/journal/");
}
