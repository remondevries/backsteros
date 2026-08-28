import { isJournalSectionPath } from "./journal.js";

export const JOURNAL_NAV_IDS = ["journal", "habits"] as const;

export type JournalNavId = (typeof JOURNAL_NAV_IDS)[number];

export type JournalNavItem = {
  id: JournalNavId;
  label: string;
  href: string;
};

export const JOURNAL_NAV_ITEMS: readonly JournalNavItem[] = [
  { id: "journal", label: "Journal", href: "/journal" },
  { id: "habits", label: "Habit Tracker", href: "/journal/habits" },
] as const;

const JOURNAL_NAV_ID_SET = new Set<string>(JOURNAL_NAV_IDS);

export function isJournalNavId(
  value: string | null | undefined,
): value is JournalNavId {
  return Boolean(value && JOURNAL_NAV_ID_SET.has(value));
}

export function getJournalNavHref(id: JournalNavId): string {
  return id === "journal" ? "/journal" : "/journal/habits";
}

export const HABIT_TRACKER_ALL_ID = "all";

export function getHabitTrackerHref(habitId?: string): string {
  if (!habitId || habitId === HABIT_TRACKER_ALL_ID) return "/journal/habits";
  return `/journal/habits/${encodeURIComponent(habitId)}`;
}

export function getHabitTrackerV2Href(habitId?: string): string {
  return getHabitTrackerHref(habitId);
}

export function isJournalHabitsPath(pathname: string): boolean {
  return (
    pathname === "/journal/habits" ||
    pathname.startsWith("/journal/habits/") ||
    isHabitsV2Path(pathname)
  );
}

export function isHabitsV2Path(pathname: string): boolean {
  return pathname === "/habits-v2" || pathname.startsWith("/habits-v2/");
}

export function getSelectedHabitIdFromPathname(
  pathname: string,
): string | undefined {
  const match = pathname.match(/^\/journal\/habits\/([^/]+)$/);
  if (match) {
    return decodeURIComponent(match[1]!);
  }
  return getSelectedHabitIdFromHabitsV2Pathname(pathname);
}

export function getSelectedHabitIdFromHabitsV2Pathname(
  pathname: string,
): string | undefined {
  const match = pathname.match(/^\/habits-v2\/([^/]+)$/);
  if (!match) return undefined;
  return decodeURIComponent(match[1]!);
}

export function getSelectedJournalNavIdFromPathname(
  pathname: string,
): JournalNavId | null {
  if (isJournalHabitsPath(pathname)) return "habits";
  if (!isJournalSectionPath(pathname)) return null;
  return "journal";
}
