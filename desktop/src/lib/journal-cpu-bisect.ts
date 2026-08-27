/**
 * TEMP kill-switches for journal nav CPU bisect.
 * Flip flags to `false` to disable each surface. Remove this file when done.
 */

/** Journal date list in the left side panel (and its API fallback fetch). */
export const ENABLE_JOURNAL_ENTRIES_SIDE_PANEL = true;

/** Day timeline / FullCalendar column on the right of the journal entry. */
export const ENABLE_JOURNAL_DAY_CALENDAR = true;

/** Due tasks + habits footer under the journal editor. */
export const ENABLE_JOURNAL_DUE_TASKS_AND_HABITS = true;

/** Whoop recovery / strain leading chrome on the journal day. */
export const ENABLE_JOURNAL_WHOOP = true;

/**
 * Full journal day screen (ensure doc, markdown body, day model, layout).
 * When false, Journal mounts a static "journal" stub with no fetches.
 */
export const ENABLE_JOURNAL_PAGE_CONTENT = true;

/**
 * Keep-alive + warm flip for journal-day / journal-habits.
 * When false, Journal uses a normal route mount via Outlet (like a cold page).
 */
export const ENABLE_JOURNAL_KEEP_ALIVE = true;

/**
 * Global keep-alive for all surfaces (Inbox, Calendar, Tasks, …).
 * When false, every section remounts via Outlet — tests previous-pane teardown theory.
 */
export const ENABLE_ALL_KEEP_ALIVE = true;
