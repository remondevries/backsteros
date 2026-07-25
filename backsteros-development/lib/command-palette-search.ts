import type { GlobalSearchResult } from "@backsteros/contracts";
import {
  sectionForSearchResultType,
  type CommandPaletteHit,
  type GoNavigationItem,
} from "@backsteros/ui";

/** Development console only supports a subset of product destinations. */
export const CONSOLE_GO_NAVIGATION_ITEMS: GoNavigationItem[] = [
  { id: "inbox", letter: "i", hint: "G I", label: "Inbox", href: "/inbox" },
  {
    id: "projects",
    letter: "p",
    hint: "G P",
    label: "Projects",
    href: "/projects",
  },
];

export const CONSOLE_COMMAND_DESTINATIONS: {
  id: string;
  label: string;
  href: string;
  iconId?: string;
  filterMode?: "projects" | "tasks";
}[] = [
  { id: "inbox", label: "Inbox", href: "/inbox", iconId: "inbox" },
  {
    id: "projects",
    label: "Projects",
    href: "/projects",
    iconId: "projects",
    filterMode: "projects",
  },
  {
    id: "tasks",
    label: "Tasks",
    href: "/tasks",
    iconId: "tasks",
    filterMode: "tasks",
  },
];

/** Map API search hits to console deep links (`/{projectId}/…`, `/inbox/…`). */
export function hrefForConsoleSearchResult(
  result: GlobalSearchResult,
): string | null {
  switch (result.type) {
    case "project":
      return `/${encodeURIComponent(result.id)}`;
    case "task":
      if (result.projectId) {
        return `/${encodeURIComponent(result.projectId)}/${encodeURIComponent(result.id)}`;
      }
      // Development inbox only surfaces tasks on codebase projects.
      return null;
    default:
      // Development console has no screens for orgs/contacts/letters/docs yet.
      return null;
  }
}

/**
 * Keep only hits that belong to codebase projects visible in this console.
 * Projects must be in the set; tasks must have a projectId in the set.
 */
export function filterConsoleSearchResults(
  results: GlobalSearchResult[],
  codebaseProjectIds: ReadonlySet<string>,
): GlobalSearchResult[] {
  if (codebaseProjectIds.size === 0) return [];
  return results.filter((result) => {
    if (result.type === "project") {
      return codebaseProjectIds.has(result.id);
    }
    if (result.type === "task") {
      return Boolean(
        result.projectId && codebaseProjectIds.has(result.projectId),
      );
    }
    return false;
  });
}

export function mapConsoleSearchResults(
  results: GlobalSearchResult[],
  codebaseProjectIds?: ReadonlySet<string>,
): CommandPaletteHit[] {
  const scoped = codebaseProjectIds
    ? filterConsoleSearchResults(results, codebaseProjectIds)
    : results;
  return scoped
    .map((result): CommandPaletteHit | null => {
      const href = hrefForConsoleSearchResult(result);
      if (!href) return null;
      const section = sectionForSearchResultType(
        result.type,
        result.documentType ?? null,
      );
      if (!section) return null;
      return {
        id: result.id,
        type: result.type,
        title: result.title,
        subtitle: result.snippet,
        href,
        section,
      };
    })
    .filter((hit): hit is CommandPaletteHit => hit != null);
}

/**
 * Map console paths (`/{projectId}/…`) onto product-style paths so the shared
 * palette context resolver can scope search to the active project.
 */
export function consolePathnameForPalette(
  locationPath: string,
  selectedProjectId: string | null,
): string {
  // Normalize inbox task deep links — context is always just "Inbox".
  if (locationPath.startsWith("/inbox")) return "/inbox";
  if (locationPath.startsWith("/settings")) return "/settings";
  if (selectedProjectId) {
    return `/projects/${encodeURIComponent(selectedProjectId)}`;
  }
  return "/inbox";
}
