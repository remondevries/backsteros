import type { ProjectRouteScope } from "./project-route-scope.js";
import {
  getScopedProjectBasePath,
  getScopedProjectDocumentHref,
} from "./project-route-scope.js";
import type { CodebaseGithubListTab } from "./components/codebase/project-fs-types.js";

export type { CodebaseGithubListTab };

export type CodebaseWorkbenchSelection = {
  tab: CodebaseGithubListTab;
  commitSha: string | null;
  pullNumber: number | null;
  /** Absolute file path when a file is open. */
  filePath: string | null;
  /** Project document path (or id) when a doc is open on the Docs tab. */
  documentPath: string | null;
};

const CODEBASE_TABS: readonly CodebaseGithubListTab[] = [
  "tasks",
  "files",
  "docs",
  "commits",
  "pulls",
];

export function isCodebaseGithubListTab(
  value: string,
): value is CodebaseGithubListTab {
  return (CODEBASE_TABS as readonly string[]).includes(value);
}

function emptySelection(
  tab: CodebaseGithubListTab,
): CodebaseWorkbenchSelection {
  return {
    tab,
    commitSha: null,
    pullNumber: null,
    filePath: null,
    documentPath: null,
  };
}

/**
 * Parse codebase workbench selection from a project pathname.
 * Recognizes `/projects/:slug/{files,documents,commits,pulls}` (and org-scoped
 * equivalents). Overview / Tasks tab is the bare project path.
 *
 * `/documents` is a workbench Docs tab on codebase projects; section-tab
 * shortcuts still treat it as a standard project section when the workbench
 * is not mounted (general projects).
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
    return emptySelection("tasks");
  }

  const head = segments[0]!;

  // Standard project sections — not workbench tabs (except documents → Docs).
  if (
    head === "tasks" ||
    head === "letters" ||
    head === "updates" ||
    head === "overview"
  ) {
    return null;
  }

  if (head === "documents") {
    const documentPath =
      segments.length > 1 ? segments.slice(1).join("/") : null;
    return {
      ...emptySelection("docs"),
      documentPath,
    };
  }

  if (head === "files") {
    const fileRest = segments.slice(1);
    let filePath: string | null = null;
    if (fileRest.length === 1) {
      // Prefer a single encoded absolute path segment.
      filePath = fileRest[0] || null;
    } else if (fileRest.length > 1) {
      // Legacy multi-segment form — reconstruct absolute path on POSIX.
      filePath = `/${fileRest.join("/")}`;
    }
    return {
      ...emptySelection("files"),
      filePath,
    };
  }

  if (head === "commits") {
    return {
      ...emptySelection("commits"),
      commitSha: segments[1] ?? null,
    };
  }

  if (head === "pulls") {
    const raw = segments[1];
    const pullNumber =
      raw && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
    return {
      ...emptySelection("pulls"),
      pullNumber,
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

  if (tab === "docs") {
    if (selection.documentPath) {
      return getScopedProjectDocumentHref(
        projectKey,
        selection.documentPath,
        scope ?? { kind: "standalone" },
      );
    }
    return `${base}/documents`;
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

/** True when pathname is a codebase workbench sub-route (files/docs/commits/pulls). */
export function isCodebaseWorkbenchPath(
  pathname: string,
  projectRouteParam: string,
): boolean {
  const parsed = parseCodebaseWorkbenchPath(pathname, projectRouteParam);
  return parsed != null && parsed.tab !== "tasks";
}
