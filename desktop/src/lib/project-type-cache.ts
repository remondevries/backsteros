/**
 * Remember project types seen in list/workspace data so detail routes can pick
 * the codebase workbench on the first paint (before a slow API type fill-in).
 */

import {
  hrefFromLocationParts,
  listReturnHrefFromState,
  recalledListReturnHref,
  rememberListReturnHref,
  resolveListReturnHref,
} from "./list-return-href";

const typesById = new Map<string, string>();
const typesByKey = new Map<string, string>();

/** Which list the user opened a project from — drives detail breadcrumbs. */
const navFromById = new Map<string, ProjectNavFrom>();
const navFromByKey = new Map<string, ProjectNavFrom>();

export type ProjectNavFrom = "catalog" | "projects";

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

export function rememberProjectListHref(
  id: string,
  key: string,
  href: string | null | undefined,
): void {
  rememberListReturnHref("project", id, href);
  rememberListReturnHref("project", key, href);
}

export function recalledProjectListHref(
  idOrKey: string | null | undefined,
): string | null {
  return recalledListReturnHref("project", idOrKey);
}

export type ProjectLocationState = {
  projectType?: string;
  /** List the user navigated from (Catalog / Projects). */
  from?: ProjectNavFrom | "areas" | "development";
  /**
   * Full list href including filter/view query (e.g. `/catalog?type=email`).
   * Breadcrumb / delete-back should restore this — Escape already does via history.
   */
  listHref?: string;
};

export function projectTypeFromLocationState(
  state: unknown,
): string | null {
  if (!state || typeof state !== "object") return null;
  const type = (state as ProjectLocationState).projectType;
  return typeof type === "string" && type.trim() ? type.trim() : null;
}

function normalizeProjectNavFrom(
  from: ProjectLocationState["from"] | null | undefined,
): ProjectNavFrom | null {
  if (from === "catalog" || from === "projects") return from;
  // Legacy Development list → Catalog.
  if (from === "development") return "catalog";
  // Legacy Areas list — now folded into Projects.
  if (from === "areas") return "projects";
  return null;
}

export function projectNavFromLocationState(
  state: unknown,
): ProjectNavFrom | null {
  if (!state || typeof state !== "object") return null;
  return normalizeProjectNavFrom((state as ProjectLocationState).from);
}

export function projectListHrefForNavFrom(from: ProjectNavFrom): string {
  if (from === "catalog") return "/catalog";
  return "/projects";
}

export function projectListLabelForNavFrom(from: ProjectNavFrom): string {
  if (from === "catalog") return "Catalog";
  return "Projects";
}

export function projectListHrefFromLocationState(
  state: unknown,
): string | null {
  return listReturnHrefFromState("project", state);
}

/**
 * Prefer the remembered filtered list href (Catalog type / Projects area),
 * then fall back to the bare section root for `from`.
 */
export function resolveProjectListHref(options: {
  locationState: unknown;
  navFrom: ProjectNavFrom;
  projectId?: string | null;
  projectKey?: string | null;
  routeParam?: string | null;
}): string {
  return resolveListReturnHref({
    kind: "project",
    locationState: options.locationState,
    ids: [options.projectId, options.projectKey, options.routeParam],
    fallback: projectListHrefForNavFrom(options.navFrom),
  });
}

/**
 * Sidebar active matching uses pathname prefixes (`/projects/...` → Projects).
 * When the user opened a project from Catalog, remap to that list
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

/**
 * Persist nav-from from navigate `state` before a warm keep-alive flip.
 * Warm flips update the URL without TanStack `navigate()`, so location state
 * never lands — caching by project key keeps Catalog highlighted.
 */
export function rememberProjectNavFromHref(
  href: string,
  state: unknown,
): void {
  const from = projectNavFromLocationState(state);
  const listHref = projectListHrefFromLocationState(state);
  if (!from && !listHref) return;
  const pathname = href.split(/[?#]/, 1)[0] ?? href;
  const match = pathname.match(/^\/projects\/([^/]+)/);
  const key = match?.[1];
  if (!key || key === "new") return;
  if (from) rememberProjectNavFrom(key, key, from);
  if (listHref) rememberProjectListHref(key, key, listHref);
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

export { hrefFromLocationParts };
