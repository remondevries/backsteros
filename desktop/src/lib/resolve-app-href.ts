import { peekSectionEntryHref } from "./section-entry-store";

/** Mirrors `@backsteros/ui` getDefaultSettingsHref — keep in sync. */
const DEFAULT_SETTINGS_HREF = "/settings/general";

/** Sidebar Tasks always opens Today — not the last due filter or open task. */
const TASKS_LIST_SIDEBAR_HREF = "/tasks?due=today";

export type PendingPageSurface =
  | "inbox"
  | "email"
  | "journal-day"
  | "journal-habits"
  | "tasks-list"
  | "task-detail"
  | "calendar"
  | "meeting-detail"
  | "areas"
  | "projects"
  | "knowledge"
  | "letters"
  | "finance"
  | "communication"
  | "social"
  | "contacts"
  | "organizations"
  | "settings"
  | "development"
  | "unknown";

export type ResolvedAppHref = {
  pathname: string;
  /** `""` or `"?key=value"` (leading `?` when present). */
  search: string;
  surface: PendingPageSurface;
};

export function normalizeNavigationHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return "/";
  const hashIndex = trimmed.indexOf("#");
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const queryIndex = withoutHash.indexOf("?");
  const pathname =
    (queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash) || "/";
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const searchPart = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  return searchPart ? `${normalizedPath}?${searchPart}` : normalizedPath;
}

export function parseNavigationPathname(href: string): string {
  const normalized = normalizeNavigationHref(href);
  const queryIndex = normalized.indexOf("?");
  return queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
}

export function formatResolvedAppHref(resolved: ResolvedAppHref): string {
  return `${resolved.pathname}${resolved.search}`;
}

function splitHref(href: string): { pathname: string; search: string } {
  const normalized = normalizeNavigationHref(href);
  const queryIndex = normalized.indexOf("?");
  if (queryIndex < 0) return { pathname: normalized, search: "" };
  return {
    pathname: normalized.slice(0, queryIndex) || "/",
    search: normalized.slice(queryIndex),
  };
}

function journalTodayHref(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `/journal/${year}-${month}-${day}`;
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** File/document splats can contain `tasks` or `letters` as folder names. */
function isSplatContentPath(parts: string[]): boolean {
  return (
    parts[0] === "knowledge" ||
    parts.includes("files") ||
    parts.includes("documents") ||
    parts.includes("commits") ||
    parts.includes("pulls")
  );
}

function isStandaloneTasksSectionPath(parts: string[]): boolean {
  return parts[0] === "tasks";
}

function isTaskDetailPath(parts: string[]): boolean {
  if (isSplatContentPath(parts)) return false;
  // Main Tasks section (list + detail) stays on keep-alive tasks-list — like inbox.
  if (isStandaloneTasksSectionPath(parts) && parts.length >= 2) return false;
  // Contact-scoped tasks stay on ContactsPage (embedded workspace column).
  if (parts[0] === "contacts") return false;
  if (parts[0] === "tasks" && parts.length >= 2) return true;
  if (parts[0] === "calendar" && parts[1] === "tasks") return true;
  const tasksIndex = parts.lastIndexOf("tasks");
  return tasksIndex >= 0 && parts[tasksIndex + 1] != null;
}

function isStandaloneOrContactLetterPath(parts: string[]): boolean {
  if (isSplatContentPath(parts)) return false;
  if (parts[0] === "letters") return true;
  // Contact-scoped letters stay on ContactsPage (embedded workspace column).
  if (parts[0] === "contacts") return false;
  const lettersIndex = parts.lastIndexOf("letters");
  if (lettersIndex < 0 || parts[lettersIndex + 1] == null) return false;
  // Project letters stay on ProjectsPage; org-contact letters use LettersPage outlet.
  return parts[0] !== "projects" && !parts.includes("projects");
}

/**
 * Mounted shell page for an already-normalized pathname (no expand / remap).
 * Canonical roots only — no `*-v2` remaps.
 */
export function surfaceForPathname(pathname: string): PendingPageSurface {
  const parts = pathSegments(pathname);
  const root = parts[0];
  if (!root) return "unknown";
  if (root === "knowledge") return "knowledge";

  if (isTaskDetailPath(parts)) return "task-detail";
  if (isStandaloneOrContactLetterPath(parts)) return "letters";

  switch (root) {
    case "inbox":
      return "inbox";
    case "email":
      return "email";
    case "journal":
      return parts[1] === "habits" ? "journal-habits" : "journal-day";
    case "tasks":
      return "tasks-list";
    case "calendar":
      return parts[1] === "meetings" ? "meeting-detail" : "calendar";
    case "areas":
      return "areas";
    case "projects":
      return "projects";
    case "finance":
      return "finance";
    case "communication":
      return "communication";
    case "social":
      return "social";
    case "contacts":
      return "contacts";
    case "organizations": {
      const projectsIndex = parts.indexOf("projects");
      if (projectsIndex >= 0 && parts[projectsIndex + 1]) return "projects";
      const contactsIndex = parts.indexOf("contacts");
      if (contactsIndex >= 0 && parts[contactsIndex + 1]) return "contacts";
      return "organizations";
    }
    case "settings":
      return "settings";
    case "development":
      return "development";
    default:
      return "unknown";
  }
}

/**
 * Expand section roots (first-item entry seed / today / defaults) then attach
 * the shell surface. One expander for sidebar, g+, warm flip, and panel first-href.
 * Section roots always open the seeded first item — not the last visited row.
 */
export function resolveAppHref(href: string): ResolvedAppHref {
  const { pathname: rawPath, search: rawSearch } = splitHref(href);
  let pathname = rawPath;
  let search = rawSearch;

  const withEntry = (entryOrPath: string) => {
    const parts = splitHref(entryOrPath);
    pathname = parts.pathname;
    // Keep the click query when present; otherwise preserve the entry's query
    // (e.g. `/email/…?list=inbox` last-place).
    search = rawSearch || parts.search;
  };

  if (pathname === "/inbox") {
    const first = peekSectionEntryHref("inbox");
    if (first) withEntry(first);
  } else if (pathname === "/communication") {
    const first = peekSectionEntryHref("communication");
    if (first) withEntry(first);
  } else if (pathname === "/contacts") {
    // Contacts catalog lives in main content (no auto-open of last contact).
  } else if (pathname === "/organizations") {
    // Organizations catalog lives in main content (no auto-open of first org).
  } else if (pathname === "/letters") {
    const first = peekSectionEntryHref("letters");
    if (first) withEntry(first);
  } else if (pathname === "/knowledge") {
    const first = peekSectionEntryHref("knowledge");
    if (first) withEntry(first);
  } else if (pathname === "/journal") {
    withEntry(journalTodayHref());
  } else if (pathname === "/email") {
    const first = peekSectionEntryHref("inbox");
    if (first) withEntry(first);
    else withEntry("/inbox");
  } else if (pathname === "/finance") {
    withEntry("/finance/dashboard");
  } else if (pathname === "/settings") {
    withEntry(DEFAULT_SETTINGS_HREF);
  } else if (pathname === "/tasks" && search === "") {
    // Same special case as the former warm-root helper.
    const tasks = splitHref(TASKS_LIST_SIDEBAR_HREF);
    pathname = tasks.pathname;
    search = tasks.search;
  }

  return {
    pathname,
    search,
    surface: surfaceForPathname(pathname),
  };
}
