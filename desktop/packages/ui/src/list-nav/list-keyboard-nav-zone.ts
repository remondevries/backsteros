import { isJournalSectionPath } from "../journal/journal.js";
import { isFinanceSectionPath } from "../navigation/entity-routes.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";

export type ListKeyboardNavZone = "sidepanel" | "content" | "main";

export const LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL: ListKeyboardNavZone = "sidepanel";
export const LIST_KEYBOARD_NAV_ZONE_CONTENT: ListKeyboardNavZone = "content";
export const LIST_KEYBOARD_NAV_ZONE_MAIN: ListKeyboardNavZone = "main";

export const LIST_KEYBOARD_NAV_CONTENT_PRIORITY = 8;

export const LIST_KEYBOARD_NAV_ZONE_ORDER: ListKeyboardNavZone[] = [
  "sidepanel",
  "content",
  "main",
];

export const LIST_KEYBOARD_NAV_ACTIVE_ZONE_ATTR = "data-keyboard-nav-active-zone";

function normalizeListKeyboardPathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** Routes whose main content includes a navigable list; j/k defaults to that list until Tab switches zone. */
export function isEntitySectionListPathname(pathname: string): boolean {
  const path = normalizeListKeyboardPathname(pathname);

  return (
    /^\/organizations\/[^/]+\/(projects|letters|contacts|transactions|invoices)$/.test(
      path,
    ) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/(tasks|letters)$/.test(path) ||
    /^\/contacts\/[^/]+\/(tasks|letters)$/.test(path)
  );
}

/** Desktop inbox list lives in the side panel (not the main column). */
export function isInboxPathname(pathname: string): boolean {
  const path = normalizeListKeyboardPathname(pathname);
  return path === "/inbox" || path.startsWith("/inbox/");
}

/**
 * Inbox-sourced email detail keeps the warm inbox list mounted
 * (`/email/…?list=inbox`). Treat like inbox for j/k zone defaults.
 */
export function isInboxListKeyboardPathname(pathname: string): boolean {
  const path = normalizeListKeyboardPathname(pathname);
  return isInboxPathname(path) || path === "/email" || path.startsWith("/email/");
}

function isCalendarListKeyboardPathname(pathname: string): boolean {
  const path = normalizeListKeyboardPathname(pathname);
  return path === "/calendar" || path.startsWith("/calendar/");
}

/** Main Tasks section list — no left list chrome; j/k owns the main column. */
export function isTasksListKeyboardPathname(pathname: string): boolean {
  const path = normalizeListKeyboardPathname(pathname);
  return path === "/tasks" || path.startsWith("/tasks/");
}

/** Projects section root has no left list — j/k owns the main overview. */
export function isProjectsRootKeyboardPathname(pathname: string): boolean {
  const path = normalizeListKeyboardPathname(pathname);
  return path === "/projects";
}

/**
 * Contacts catalog (list in main + optional profile overlay).
 * Nested task/letter detail routes are excluded.
 */
export function isContactsCatalogKeyboardPathname(pathname: string): boolean {
  const path = normalizeListKeyboardPathname(pathname);
  if (path === "/contacts") return true;
  if (!path.startsWith("/contacts/")) return false;
  return !/^\/contacts\/[^/]+\/(tasks|letters)(\/|$)/.test(path);
}

/** Flags for {@link resolveZonePolicy}. Calendar mode is passed in — not read from the DOM here. */
export type ResolveZonePolicyFlags = {
  /** Value of `[data-calendar-page-mode]` when on a calendar route. */
  calendarPageMode?: string | null;
  /** After Tab/Escape onto the side panel, keep j/k there until the user opens main. */
  preferSidepanelForJk?: boolean;
  /** Zone last chosen by Tab / Escape / route sync. */
  activeZone?: ListKeyboardNavZone | null;
  /** Whether a navigable main-zone list is registered. */
  hasMainList?: boolean;
};

export type ListKeyboardZonePolicy = {
  /** Zone to activate when the pathname changes (before Tab). */
  defaultZone: ListKeyboardNavZone;
  /** Path allows j/k to leave sidepanel for main without Tab. */
  autoSwitchJkToMain: boolean;
  /** Zone that owns j/k given path + flags. */
  jkZone: ListKeyboardNavZone;
};

type ZonePolicyRow = {
  match: (path: string) => boolean;
  defaultZone: ListKeyboardNavZone;
  autoSwitchJkToMain: boolean | ((flags: ResolveZonePolicyFlags) => boolean);
  /**
   * When defaultZone is `main`, still honor Tab/Escape pinning j/k on the
   * left list (contacts/orgs entity tabs). Tasks / projects root omit this —
   * they have no useful left list for Tab to land on.
   */
  allowSidepanelPreference?: boolean;
};

/**
 * Path → zone policy rows. First match wins.
 * Do not invent zones beyond sidepanel / content / main.
 */
const ZONE_POLICY_ROWS: readonly ZonePolicyRow[] = [
  {
    match: isEntitySectionListPathname,
    // Land j/k on the content list, but never steal back from the left list
    // after Tab / click / Escape (same sticky model as Journal).
    defaultZone: "main",
    autoSwitchJkToMain: false,
    allowSidepanelPreference: true,
  },
  {
    match: isTasksListKeyboardPathname,
    defaultZone: "main",
    autoSwitchJkToMain: true,
  },
  {
    match: isProjectsRootKeyboardPathname,
    defaultZone: "main",
    autoSwitchJkToMain: true,
  },
  {
    match: isContactsCatalogKeyboardPathname,
    defaultZone: "main",
    autoSwitchJkToMain: true,
  },
  {
    match: isInboxListKeyboardPathname,
    defaultZone: "sidepanel",
    autoSwitchJkToMain: false,
  },
  {
    match: (path) => isJournalSectionPath(path) || isFinanceSectionPath(path),
    defaultZone: "sidepanel",
    autoSwitchJkToMain: false,
  },
  {
    match: isCalendarListKeyboardPathname,
    defaultZone: "sidepanel",
    // Timetracking keeps j/k on the left list; other calendar modes may auto-switch.
    autoSwitchJkToMain: (flags) => flags.calendarPageMode !== "timetracking",
  },
];

const DEFAULT_ZONE_POLICY_ROW: ZonePolicyRow = {
  match: () => true,
  defaultZone: "sidepanel",
  autoSwitchJkToMain: true,
};

function matchZonePolicyRow(pathname: string): ZonePolicyRow {
  const path = normalizeListKeyboardPathname(pathname);
  for (const row of ZONE_POLICY_ROWS) {
    if (row.match(path)) return row;
  }
  return DEFAULT_ZONE_POLICY_ROW;
}

/**
 * One table: pathname + flags → which list zone owns the keys.
 * Pure list-step helpers stay separate; the provider looks this up then steps.
 */
export function resolveZonePolicy(
  pathname: string,
  flags: ResolveZonePolicyFlags = {},
): ListKeyboardZonePolicy {
  const row = matchZonePolicyRow(pathname);
  const autoSwitchJkToMain =
    typeof row.autoSwitchJkToMain === "function"
      ? row.autoSwitchJkToMain(flags)
      : row.autoSwitchJkToMain;
  const defaultZone = row.defaultZone;
  const activeZone = flags.activeZone ?? defaultZone;
  // Sidepanel-home routes always honor Tab/Escape preference. Main-home
  // entity tabs (contacts/orgs) do too via allowSidepanelPreference. Main-only
  // surfaces (tasks) ignore it so a leftover preference cannot trap j/k.
  // Stale preference across keep-alive surfaces is cleared in the provider.
  const preferSidepanelForJk =
    Boolean(flags.preferSidepanelForJk) &&
    (defaultZone === "sidepanel" || Boolean(row.allowSidepanelPreference));

  let jkZone: ListKeyboardNavZone = activeZone;
  if (defaultZone === "main" && flags.hasMainList) {
    if (row.allowSidepanelPreference) {
      // Contacts/orgs: pathname sync lands on main; once the side panel is
      // active (Tab / click / Escape), j/k must stay there — do not require
      // preferSidepanelForJk (it can be cleared by activate:false syncs).
      if (activeZone == null) {
        jkZone = "main";
      }
    } else if (activeZone === "sidepanel" || activeZone == null) {
      // Main-only surfaces (tasks): ignore a stale sidepanel active zone.
      jkZone = "main";
    }
  } else if (
    flags.hasMainList &&
    activeZone === "sidepanel" &&
    !preferSidepanelForJk &&
    autoSwitchJkToMain
  ) {
    jkZone = "main";
  }

  return { defaultZone, autoSwitchJkToMain, jkZone };
}

/** Read calendar page mode for {@link resolveZonePolicy} — keep DOM out of the table. */
export function readCalendarPageModeFromDocument(
  doc: Document | null | undefined = typeof document !== "undefined"
    ? document
    : null,
): string | null {
  if (!doc) return null;
  return (
    doc
      .querySelector("[data-calendar-page-mode]")
      ?.getAttribute("data-calendar-page-mode") ?? null
  );
}

/** Coarse section key for j/k ownership across keep-alive surface flips. */
export function getListKeyboardNavSurfaceKey(pathname: string): string {
  const path = normalizeListKeyboardPathname(pathname);
  if (isInboxListKeyboardPathname(path)) return "inbox";
  if (isJournalSectionPath(path)) return "journal";
  if (isFinanceSectionPath(path)) return "finance";
  if (isCalendarListKeyboardPathname(path)) return "calendar";
  if (isTasksListKeyboardPathname(path)) return "tasks";
  if (path === "/projects" || path.startsWith("/projects/")) return "projects";
  if (path === "/contacts" || path.startsWith("/contacts/")) return "contacts";
  if (path === "/organizations" || path.startsWith("/organizations/")) {
    return "organizations";
  }
  if (path === "/letters" || path.startsWith("/letters/")) return "letters";
  if (path === "/knowledge" || path.startsWith("/knowledge/")) return "knowledge";
  return path.split("/").filter(Boolean)[0] ?? "/";
}

/** Default j/k target when Tab has not been used yet on this view. */
export function getDefaultListKeyboardNavZone(
  pathname: string,
): ListKeyboardNavZone {
  return resolveZonePolicy(pathname).defaultZone;
}

/** Journal / Finance / Calendar Timetracking / Inbox keep j/k on the side panel until Tab. */
export function shouldAutoSwitchJkToMainList(
  pathname: string,
  calendarPageMode?: string | null,
): boolean {
  return resolveZonePolicy(pathname, {
    calendarPageMode:
      calendarPageMode === undefined
        ? readCalendarPageModeFromDocument()
        : calendarPageMode,
  }).autoSwitchJkToMain;
}

export function shouldHandleListKeyboardZoneTab(event: KeyboardEvent): boolean {
  if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  return shouldHandleGlobalShortcut(event);
}

export function getListKeyboardNavTabDirection(
  event: Pick<KeyboardEvent, "shiftKey">,
): "forward" | "backward" {
  return event.shiftKey ? "backward" : "forward";
}

export function orderListKeyboardNavZones(
  available: ListKeyboardNavZone[],
): ListKeyboardNavZone[] {
  return LIST_KEYBOARD_NAV_ZONE_ORDER.filter((zone) => available.includes(zone));
}

export function stepListKeyboardNavZone(
  current: ListKeyboardNavZone,
  direction: "forward" | "backward",
  available: ListKeyboardNavZone[],
): ListKeyboardNavZone | null {
  const ordered = orderListKeyboardNavZones(available);
  if (ordered.length < 2) {
    return null;
  }

  const currentIndex = ordered.indexOf(current);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const step = direction === "forward" ? 1 : -1;
  const nextIndex = (startIndex + step + ordered.length) % ordered.length;
  return ordered[nextIndex] ?? null;
}

/** Pick the preferred zone when it has items, otherwise the first available zone. */
export function resolveActiveListKeyboardNavZone(
  preferred: ListKeyboardNavZone,
  available: ListKeyboardNavZone[],
): ListKeyboardNavZone | null {
  const ordered = orderListKeyboardNavZones(available);
  if (ordered.length === 0) {
    return null;
  }

  if (ordered.includes(preferred)) {
    return preferred;
  }

  return ordered[0] ?? null;
}

/** Next zone when the current zone has no navigable items (empty list / no links). */
export function stepListKeyboardNavZoneFromUnavailable(
  current: ListKeyboardNavZone,
  direction: "forward" | "backward",
  available: ListKeyboardNavZone[],
): ListKeyboardNavZone | null {
  const ordered = orderListKeyboardNavZones(available);
  if (ordered.length === 0) {
    return null;
  }

  if (ordered.length === 1) {
    return ordered[0] ?? null;
  }

  const currentIndex = LIST_KEYBOARD_NAV_ZONE_ORDER.indexOf(current);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;

  for (let offset = 1; offset <= LIST_KEYBOARD_NAV_ZONE_ORDER.length; offset++) {
    const index =
      direction === "forward"
        ? (startIndex + offset) % LIST_KEYBOARD_NAV_ZONE_ORDER.length
        : (startIndex - offset + LIST_KEYBOARD_NAV_ZONE_ORDER.length) %
          LIST_KEYBOARD_NAV_ZONE_ORDER.length;
    const candidate = LIST_KEYBOARD_NAV_ZONE_ORDER[index]!;
    if (available.includes(candidate)) {
      return candidate;
    }
  }

  return ordered[0] ?? null;
}

export function resolveListKeyboardNavTabTargetZone(
  current: ListKeyboardNavZone,
  direction: "forward" | "backward",
  available: ListKeyboardNavZone[],
  currentHasItems: boolean,
): ListKeyboardNavZone | null {
  if (available.length === 0) {
    return null;
  }

  if (!currentHasItems) {
    return stepListKeyboardNavZoneFromUnavailable(current, direction, available);
  }

  if (available.length === 1) {
    return null;
  }

  return stepListKeyboardNavZone(current, direction, available);
}

/**
 * While a right detail pane is open (or main+content lists both exist), Tab
 * cycles between the main list and the detail list — not the left nav.
 * Left nav rejoins the Tab cycle only when the detail is closed.
 */
export function filterListKeyboardNavZonesForTab(
  available: ListKeyboardNavZone[],
  detailOpen = false,
): ListKeyboardNavZone[] {
  const keepFocusInMainContent =
    detailOpen ||
    (available.includes("main") && available.includes("content"));

  if (!keepFocusInMainContent || !available.includes("main")) {
    return available;
  }

  const withoutSidepanel = available.filter((zone) => zone !== "sidepanel");
  return withoutSidepanel.length > 0 ? withoutSidepanel : available;
}

export type ApplyListKeyboardNavZoneOptions = {
  /** When true, j/k keeps navigating the side panel until the user opens a main list or changes route. */
  preferSidepanelForJk?: boolean;
  /** When true, focus the zone list and restore its highlight after switching. */
  activate?: boolean;
  /**
   * When activating, highlight this item instead of the selected row / first
   * item (e.g. G then P → first project in the console rail).
   */
  highlightItemId?: string | null;
  /**
   * When activating after a keep-alive surface reclaim, land on the first list
   * item (ignore selected row and prior j/k highlight).
   */
  landAtStart?: boolean;
};
