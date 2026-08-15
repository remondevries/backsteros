/**
 * Remember project types seen in list/workspace data so detail routes can pick
 * the codebase workbench on the first paint (before a slow API type fill-in).
 */
const typesById = new Map<string, string>();
const typesByKey = new Map<string, string>();

/** Which list the user opened a project from — drives detail breadcrumbs. */
const navFromById = new Map<string, ProjectNavFrom>();
const navFromByKey = new Map<string, ProjectNavFrom>();

export type ProjectNavFrom = "areas" | "development" | "projects";

export function rememberProjectType(
  id: string,
  key: string,
  type: string | null | undefined,
): void {
  const normalized = typeof type === "string" ? type.trim() : "";
  if (!normalized) return;
  typesById.set(id, normalized);
  typesByKey.set(key.toLowerCase(), normalized);
}

export function rememberProjectTypes(
  projects: ReadonlyArray<{
    id: string;
    key: string;
    type?: string | null;
  }>,
): void {
  for (const project of projects) {
    rememberProjectType(project.id, project.key, project.type);
  }
}

export function recalledProjectType(
  idOrKey: string | null | undefined,
): string | null {
  if (!idOrKey) return null;
  return typesById.get(idOrKey) ?? typesByKey.get(idOrKey.toLowerCase()) ?? null;
}

export function rememberProjectNavFrom(
  id: string,
  key: string,
  from: ProjectNavFrom | null | undefined,
): void {
  if (!from) return;
  navFromById.set(id, from);
  navFromByKey.set(key.toLowerCase(), from);
}

export function recalledProjectNavFrom(
  idOrKey: string | null | undefined,
): ProjectNavFrom | null {
  if (!idOrKey) return null;
  return (
    navFromById.get(idOrKey) ?? navFromByKey.get(idOrKey.toLowerCase()) ?? null
  );
}

export type ProjectLocationState = {
  projectType?: string;
  /** List the user navigated from (Areas / Development / Projects). */
  from?: ProjectNavFrom;
};

export function projectTypeFromLocationState(
  state: unknown,
): string | null {
  if (!state || typeof state !== "object") return null;
  const type = (state as ProjectLocationState).projectType;
  return typeof type === "string" && type.trim() ? type.trim() : null;
}

export function projectNavFromLocationState(
  state: unknown,
): ProjectNavFrom | null {
  if (!state || typeof state !== "object") return null;
  const from = (state as ProjectLocationState).from;
  if (from === "areas" || from === "development" || from === "projects") {
    return from;
  }
  return null;
}

export function projectListHrefForNavFrom(from: ProjectNavFrom): string {
  if (from === "areas") return "/areas";
  if (from === "development") return "/development";
  return "/projects";
}

export function projectListLabelForNavFrom(from: ProjectNavFrom): string {
  if (from === "areas") return "Areas";
  if (from === "development") return "Development";
  return "Projects";
}

/**
 * Sidebar active matching uses pathname prefixes (`/projects/...` → Projects).
 * When the user opened a project from Development or Areas, remap to that list
 * so the correct nav item stays highlighted.
 */
export function resolveSidebarActivePathname(
  pathname: string,
  navFrom: ProjectNavFrom | null | undefined,
): string {
  if (!navFrom || navFrom === "projects") return pathname;

  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match || match[1] === "new") return pathname;

  return projectListHrefForNavFrom(navFrom);
}

/** Prefer location state, then the in-memory nav-from cache. */
export function resolveProjectNavFromForPath(options: {
  locationState: unknown;
  projectId?: string | null;
  projectKey?: string | null;
  routeParam?: string | null;
}): ProjectNavFrom | null {
  return (
    projectNavFromLocationState(options.locationState) ??
    recalledProjectNavFrom(options.projectId) ??
    recalledProjectNavFrom(options.projectKey) ??
    recalledProjectNavFrom(options.routeParam)
  );
}
