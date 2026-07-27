/** Mirrors `@backsteros/ui` journal date helpers. */

const JOURNAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
