import { isEntityRouteUuid } from "@/lib/entity-slugs";
import { getPrimedTabTitle } from "@/lib/tabs/primed-tab-title";

const STATIC_TITLES: Record<string, string> = {
  "/": "Inbox",
  "/inbox": "Inbox",
  "/journal": "Journal",
  "/knowledge": "Knowledge Base",
  "/tasks": "Tasks",
  "/projects": "Projects",
  "/contacts": "Contacts",
  "/letters": "Letters",
  "/organizations": "Organizations",
  "/projects/new": "New project",
  "/settings": "Settings",
  "/settings/general": "General",
  "/settings/whoop": "Whoop",
  "/settings/storage": "Storage",
  "/settings/cursor": "Cursor",
};

/** Display slugs like `in-8` / `abc-12` — OK as interim tab labels. */
function isDisplayEntitySlug(segment: string): boolean {
  return /^[a-z][a-z0-9]*-\d+$/i.test(segment);
}

function looksLikeRawEntityId(segment: string): boolean {
  if (isEntityRouteUuid(segment)) return true;
  if (isDisplayEntitySlug(segment)) return false;
  // Local/optimistic ids, long opaque tokens, etc.
  return segment.length >= 20;
}

export function getTabTitleForHref(href: string): string {
  const normalized = normalizeTabHref(href);

  const primed = getPrimedTabTitle(normalized);
  if (primed) {
    return primed;
  }

  if (STATIC_TITLES[normalized]) {
    return STATIC_TITLES[normalized]!;
  }

  const projectMatch = normalized.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    return "Project";
  }

  const segments = normalized.split("/").filter(Boolean);
  const last = segments.at(-1);
  if (!last) return "Home";

  // Avoid flashing UUID / opaque ids in the tab before RegisterTabTitle runs.
  if (looksLikeRawEntityId(decodeURIComponent(last))) {
    if (segments[0] === "inbox") return "Task";
    if (segments[0] === "letters") return "Letter";
    if (segments.includes("tasks")) return "Task";
    if (segments.includes("documents") || segments[0] === "knowledge") {
      return "Document";
    }
    return "Page";
  }

  return last
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeTabHref(href: string): string {
  if (!href || href === "/") return "/";

  const [path] = href.split(/[?#]/);
  return path!.replace(/\/+$/, "") || "/";
}
