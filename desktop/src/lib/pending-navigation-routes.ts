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

/** Live window href (`/tasks?due=today`). */
export function currentWindowNavigationHref(): string {
  if (typeof window === "undefined") return "/";
  return normalizeNavigationHref(
    `${window.location.pathname}${window.location.search}`,
  );
}

/** Mounted shell page for an href. */
export type PendingPageSurface =
  | "inbox"
  | "email"
  | "journal-day"
  | "journal-habits"
  | "tasks-list"
  | "journal-v2"
  | "habits-v2"
  | "knowledge-v2"
  | "letters-v2"
  | "task-detail"
  | "calendar"
  | "meeting-detail"
  | "areas"
  | "projects"
  | "knowledge"
  | "letters"
  | "finance"
  | "contacts"
  | "organizations"
  | "settings"
  | "development"
  | "unknown";

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** File/document splats can contain `tasks` or `letters` as folder names. */
function isSplatContentPath(parts: string[]): boolean {
  return (
    parts[0] === "knowledge" ||
    parts[0] === "knowledge-v2" ||
    parts.includes("files") ||
    parts.includes("documents") ||
    parts.includes("commits") ||
    parts.includes("pulls")
  );
}

function isTaskDetailPath(parts: string[]): boolean {
  if (isSplatContentPath(parts)) return false;
  if (parts[0] === "tasks" && parts.length >= 2) return true;
  if (parts[0] === "calendar" && parts[1] === "tasks") return true;
  const tasksIndex = parts.lastIndexOf("tasks");
  return tasksIndex >= 0 && parts[tasksIndex + 1] != null;
}

function isStandaloneOrContactLetterPath(parts: string[]): boolean {
  if (isSplatContentPath(parts)) return false;
  if (parts[0] === "letters") return true;
  const lettersIndex = parts.lastIndexOf("letters");
  if (lettersIndex < 0 || parts[lettersIndex + 1] == null) return false;
  // Project letters stay on ProjectsPage; contact letters use LettersPage.
  return parts[0] !== "projects" && !parts.includes("projects");
}

export function resolvePendingPageSurface(href: string): PendingPageSurface {
  const parts = pathSegments(parseNavigationPathname(href));
  const root = parts[0];
  if (!root) return "unknown";
  if (root === "knowledge") return "knowledge";
  if (root === "knowledge-v2") return "knowledge-v2";

  if (isTaskDetailPath(parts)) return "task-detail";
  if (root === "letters-v2") return "letters-v2";
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
    case "journal-v2":
      return "journal-v2";
    case "habits-v2":
      return "habits-v2";
    case "calendar":
      return parts[1] === "meetings" ? "meeting-detail" : "calendar";
    case "areas":
      return "areas";
    case "projects":
      return "projects";
    case "finance":
      return "finance";
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
