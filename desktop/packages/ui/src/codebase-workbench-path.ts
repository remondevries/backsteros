import type { ProjectRouteScope } from "./project-route-scope.js";
import { getScopedProjectBasePath } from "./project-route-scope.js";
import type { CodebaseGithubListTab } from "./components/codebase/project-fs-types.js";

export type { CodebaseGithubListTab };

export type CodebaseWorkbenchSelection = {
  tab: CodebaseGithubListTab;
  commitSha: string | null;
  pullNumber: number | null;
  /** Absolute file path when a file is open. */
  filePath: string | null;
};

const CODEBASE_TABS: readonly CodebaseGithubListTab[] = [
  "tasks",
  "files",
  "commits",
  "pulls",
];

export function isCodebaseGithubListTab(
  value: string,
): value is CodebaseGithubListTab {
  return (CODEBASE_TABS as readonly string[]).includes(value);
}

/**
 * Parse codebase workbench selection from a project pathname.
 * Recognizes `/projects/:slug/{files,commits,pulls}` (and org-scoped equivalents).
 * Overview / Tasks tab is the bare project path (or unknown segments under overview).
 */
export function parseCodebaseWorkbenchPath(
  pathname: string,
  projectRouteParam: string,
): CodebaseWorkbenchSelection | null {
  const target = projectRouteParam.toLowerCase();
  const org = pathname.match(/^(\/organizations\/[^/]+\/projects\/([^/]+))(.*)$/);
  const stand = pathname.match(/^(\/projects\/([^/]+))(.*)$/);
  const match = org ?? stand;
  if (!match) return null;

  const routeParam = decodeURIComponent(match[2]!);
  if (routeParam.toLowerCase() !== target) return null;

  const rest = match[3] ?? "";
  const segments = rest
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length === 0) {
    return { tab: "tasks", commitSha: null, pullNumber: null, filePath: null };
  }

  const head = segments[0]!;

  // Standard project sections — not workbench tabs.
  if (
    head === "tasks" ||
    head === "documents" ||
    head === "letters" ||
    head === "updates" ||
    head === "overview"
  ) {
    return null;
  }

  if (head === "files") {
    const rest = segments.slice(1);
    let filePath: string | null = null;
    if (rest.length === 1) {
      // Prefer a single encoded absolute path segment.
      filePath = rest[0] || null;
    } else if (rest.length > 1) {
      // Legacy multi-segment form — reconstruct absolute path on POSIX.
      filePath = `/${rest.join("/")}`;
    }
    return {
      tab: "files",
      commitSha: null,
      pullNumber: null,
      filePath,
    };
  }

  if (head === "commits") {
    return {
      tab: "commits",
      commitSha: segments[1] ?? null,
      pullNumber: null,
      filePath: null,
    };
  }

  if (head === "pulls") {
    const raw = segments[1];
    const pullNumber =
      raw && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
    return {
      tab: "pulls",
      commitSha: null,
      pullNumber,
      filePath: null,
    };
  }

  return null;
}

export function getCodebaseWorkbenchHref(
  projectKey: string,
  selection: Partial<CodebaseWorkbenchSelection> & {
    tab?: CodebaseGithubListTab;
  },
  scope?: ProjectRouteScope | null,
): string {
  const base = getScopedProjectBasePath(projectKey, scope ?? undefined);
  const tab = selection.tab ?? "tasks";

  if (tab === "tasks") return base;

  if (tab === "files") {
    if (selection.filePath) {
      return `${base}/files/${encodeURIComponent(selection.filePath)}`;
    }
    return `${base}/files`;
  }

  if (tab === "commits") {
    if (selection.commitSha) {
      return `${base}/commits/${encodeURIComponent(selection.commitSha)}`;
    }
    return `${base}/commits`;
  }

  if (tab === "pulls") {
    if (selection.pullNumber != null) {
      return `${base}/pulls/${selection.pullNumber}`;
    }
    return `${base}/pulls`;
  }

  return base;
}

/** True when pathname is a codebase workbench sub-route (files/commits/pulls). */
export function isCodebaseWorkbenchPath(
  pathname: string,
  projectRouteParam: string,
): boolean {
  const parsed = parseCodebaseWorkbenchPath(pathname, projectRouteParam);
  return parsed != null && parsed.tab !== "tasks";
}
