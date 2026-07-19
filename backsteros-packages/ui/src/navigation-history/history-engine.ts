import { getTabTitleForHref, normalizeTabHref } from "../tabs.js";
import {
  NAVIGATION_HISTORY_MAX_ENTRIES,
  NAVIGATION_HISTORY_RECENT_LIMIT,
} from "./constants.js";
import type { NavigationHistoryEntry, NavigationHistoryState } from "./types.js";

export function normalizeHistoryEntryHref(href: string): string {
  const [path] = href.split(/[?#]/);
  return normalizeTabHref(path ?? "/");
}

export function historyEntryHrefsMatch(left: string, right: string): boolean {
  return normalizeHistoryEntryHref(left) === normalizeHistoryEntryHref(right);
}

export function findStoredPageIconForHref(
  entries: NavigationHistoryEntry[],
  href: string,
): string | null | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (!historyEntryHrefsMatch(entry.href, href)) {
      continue;
    }

    if (entry.icon !== undefined) {
      return entry.icon;
    }
  }

  return undefined;
}

function withResolvedPageIcon(
  entry: NavigationHistoryEntry,
  entries: NavigationHistoryEntry[],
): NavigationHistoryEntry {
  if (entry.icon !== undefined) {
    return entry;
  }

  const storedIcon = findStoredPageIconForHref(entries, entry.href);
  if (storedIcon === undefined) {
    return entry;
  }

  return { ...entry, icon: storedIcon };
}

function updateEntryTitle(
  entries: NavigationHistoryEntry[],
  index: number,
  title: string,
  href: string,
): NavigationHistoryEntry[] {
  const entry = entries[index];
  if (!entry) {
    return entries;
  }

  if (entry.title === title && entry.href === href) {
    return entries;
  }

  return entries.map((item, itemIndex) =>
    itemIndex === index ? { ...item, title, href } : item,
  );
}

function syncToIndex(
  state: NavigationHistoryState,
  index: number,
  href: string,
  title: string,
): NavigationHistoryState {
  return {
    entries: updateEntryTitle(state.entries, index, title, href),
    index,
  };
}

function pushEntry(
  state: NavigationHistoryState,
  href: string,
  title: string,
): NavigationHistoryState {
  const truncated = state.entries.slice(0, state.index + 1);
  const last = truncated.at(-1);

  if (last?.href === href) {
    return syncToIndex(
      { entries: truncated, index: truncated.length - 1 },
      truncated.length - 1,
      href,
      title,
    );
  }

  const storedIcon = findStoredPageIconForHref(truncated, href);
  const nextEntry: NavigationHistoryEntry = {
    href,
    title,
    visitedAt: Date.now(),
    ...(storedIcon !== undefined ? { icon: storedIcon } : {}),
  };

  const nextEntries = [...truncated, nextEntry];

  if (nextEntries.length <= NAVIGATION_HISTORY_MAX_ENTRIES) {
    return {
      entries: nextEntries,
      index: nextEntries.length - 1,
    };
  }

  const entries = nextEntries.slice(-NAVIGATION_HISTORY_MAX_ENTRIES);

  return {
    entries,
    index: entries.length - 1,
  };
}

export function createInitialHistoryState(
  href: string,
  title: string,
): NavigationHistoryState {
  return {
    entries: [{ href, title, visitedAt: Date.now() }],
    index: 0,
  };
}

export function resolveHistoryEntryTitle(
  href: string,
  pageTitles: ReadonlyMap<string, string>,
): string {
  const [path] = href.split(/[?#]/);
  const normalizedPath = path ?? "/";
  return pageTitles.get(normalizedPath) ?? getTabTitleForHref(normalizedPath);
}

const UUID_ROUTE_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeProjectKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function splitPathSegments(href: string): string[] {
  return normalizeHistoryEntryHref(href).split("/").filter(Boolean);
}

function segmentsMatchExcept(
  fromSegments: string[],
  toSegments: string[],
  changedIndex: number,
): boolean {
  return (
    fromSegments.length === toSegments.length &&
    fromSegments.every(
      (segment, index) =>
        index === changedIndex || segment === toSegments[index],
    )
  );
}

/**
 * UUID ↔ slug canonicalization (same entity, not a new navigation).
 * Ported from Next `lib/navigation-history/history-engine.ts`.
 */
function isCanonicalEntityRedirect(fromHref: string, toHref: string): boolean {
  const fromPath = normalizeHistoryEntryHref(fromHref);
  const toPath = normalizeHistoryEntryHref(toHref);

  if (fromPath !== toPath && fromPath.toLowerCase() === toPath.toLowerCase()) {
    return true;
  }

  const fromSegments = splitPathSegments(fromHref);
  const toSegments = splitPathSegments(toHref);
  const section = fromSegments[0];

  if (
    (section === "projects" ||
      section === "contacts" ||
      section === "organizations") &&
    segmentsMatchExcept(fromSegments, toSegments, 1)
  ) {
    const fromEntity = decodeURIComponent(fromSegments[1] ?? "");
    const toEntity = toSegments[1] ?? "";
    return (
      UUID_ROUTE_SEGMENT.test(fromEntity) ||
      normalizeProjectKey(fromEntity).toLowerCase() === toEntity.toLowerCase()
    );
  }

  if (
    (section === "inbox" || section === "letters") &&
    segmentsMatchExcept(fromSegments, toSegments, 1)
  ) {
    const fromEntity = decodeURIComponent(fromSegments[1] ?? "");
    return UUID_ROUTE_SEGMENT.test(fromEntity);
  }

  return (
    section === "projects" &&
    fromSegments[2] === "letters" &&
    segmentsMatchExcept(fromSegments, toSegments, 3) &&
    UUID_ROUTE_SEGMENT.test(decodeURIComponent(fromSegments[3] ?? ""))
  );
}

/**
 * Section roots that auto-land on a default child (replace, don't push).
 *
 * `/tasks` and `/projects` are intentionally excluded: their roots are real
 * list screens, so opening a row must push a history entry (Escape returns
 * to the list). Same rule as Next `getTaskReferrerBackHref` treating due-task
 * detail as a back target to the tasks list.
 */
const AUTO_LANDING_SECTION_ROOTS = [
  "/",
  "/inbox",
  "/journal",
  "/knowledge",
  "/letters",
  "/contacts",
  "/organizations",
  "/settings",
] as const;

/**
 * Treats a route redirect (e.g. `/` → `/inbox`, or a section root auto-select)
 * as a continuation of the same navigation rather than a new history entry.
 */
export function isRedirectContinuation(
  fromHref: string,
  toHref: string,
): boolean {
  const fromPath = normalizeHistoryEntryHref(fromHref);
  const toPath = normalizeHistoryEntryHref(toHref);

  if (
    (AUTO_LANDING_SECTION_ROOTS as readonly string[]).includes(fromPath) &&
    toPath.startsWith(`${fromPath}/`)
  ) {
    return true;
  }

  if (
    (fromPath === "/" && toPath.startsWith("/inbox")) ||
    (fromPath === "/areas" && toPath === "/projects") ||
    (/^\/projects\/[^/]+\/documents$/.test(fromPath) &&
      toPath.startsWith(`${fromPath}/`))
  ) {
    return true;
  }

  return isCanonicalEntityRedirect(fromHref, toHref);
}

export function applyPathnameChange(
  state: NavigationHistoryState,
  currentHref: string,
  title: string,
  pendingIndex: number | null,
): NavigationHistoryState {
  if (pendingIndex !== null) {
    return syncToIndex(state, pendingIndex, currentHref, title);
  }

  const { entries, index } = state;

  if (entries[index]?.href === currentHref) {
    return syncToIndex(state, index, currentHref, title);
  }

  if (
    entries[index] &&
    isRedirectContinuation(entries[index].href, currentHref)
  ) {
    return syncToIndex(state, index, currentHref, title);
  }

  if (entries[index + 1]?.href === currentHref) {
    return syncToIndex(state, index + 1, currentHref, title);
  }

  if (index > 0 && entries[index - 1]?.href === currentHref) {
    return syncToIndex(state, index - 1, currentHref, title);
  }

  return pushEntry(state, currentHref, title);
}

export function getRecentHistoryPages(
  state: NavigationHistoryState,
): NavigationHistoryEntry[] {
  const currentHref = state.entries[state.index]?.href;
  const seen = new Set<string>();
  const recent: NavigationHistoryEntry[] = [];

  for (let index = state.entries.length - 1; index >= 0; index -= 1) {
    const entry = state.entries[index]!;
    if (entry.href === currentHref || seen.has(entry.href)) {
      continue;
    }

    seen.add(entry.href);
    recent.push(withResolvedPageIcon(entry, state.entries));

    if (recent.length >= NAVIGATION_HISTORY_RECENT_LIMIT) {
      break;
    }
  }

  return recent;
}

export function areHistoryStatesEqual(
  left: NavigationHistoryState,
  right: NavigationHistoryState,
): boolean {
  if (
    left.index !== right.index ||
    left.entries.length !== right.entries.length
  ) {
    return false;
  }

  return left.entries.every(
    (entry, index) =>
      entry.href === right.entries[index]?.href &&
      entry.title === right.entries[index]?.title,
  );
}
