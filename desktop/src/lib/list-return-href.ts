/**
 * Remember the filtered list URL when opening a detail row so breadcrumbs /
 * delete-back can restore the same tab/filter/view Escape already gets via
 * history (e.g. `/catalog?type=email`, `/tasks?due=today&view=board`).
 */

export type ListReturnKind = "project" | "task";

const ALLOWED_PATHS: Record<ListReturnKind, ReadonlySet<string>> = {
  project: new Set(["/catalog", "/projects", "/development"]),
  task: new Set(["/tasks"]),
};

const hrefByKey = new Map<string, string>();

function cacheKey(kind: ListReturnKind, idOrKey: string): string {
  return `${kind}:${idOrKey.toLowerCase()}`;
}

function pathOnly(href: string): string {
  return href.split(/[?#]/, 1)[0] || "/";
}

/** Normalize and accept only section list roots for the kind. */
export function normalizeListReturnHref(
  kind: ListReturnKind,
  href: string | null | undefined,
): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (!trimmed.startsWith("/")) return null;
  const path = pathOnly(trimmed);
  if (!ALLOWED_PATHS[kind].has(path)) return null;
  if (kind === "project" && path === "/development") {
    return `/catalog${trimmed.slice(path.length)}`;
  }
  return trimmed;
}

export function rememberListReturnHref(
  kind: ListReturnKind,
  idOrKey: string,
  href: string | null | undefined,
): void {
  const normalized = normalizeListReturnHref(kind, href);
  if (!normalized || !idOrKey.trim()) return;
  hrefByKey.set(cacheKey(kind, idOrKey), normalized);
}

export function recalledListReturnHref(
  kind: ListReturnKind,
  idOrKey: string | null | undefined,
): string | null {
  if (!idOrKey) return null;
  return hrefByKey.get(cacheKey(kind, idOrKey)) ?? null;
}

export function listReturnHrefFromState(
  kind: ListReturnKind,
  state: unknown,
  field = "listHref",
): string | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[field];
  return normalizeListReturnHref(
    kind,
    typeof value === "string" ? value : null,
  );
}

export function resolveListReturnHref(options: {
  kind: ListReturnKind;
  locationState: unknown;
  ids?: ReadonlyArray<string | null | undefined>;
  fallback: string;
  stateField?: string;
}): string {
  const fromState = listReturnHrefFromState(
    options.kind,
    options.locationState,
    options.stateField,
  );
  if (fromState) return fromState;
  for (const id of options.ids ?? []) {
    const recalled = recalledListReturnHref(options.kind, id);
    if (recalled) return recalled;
  }
  return options.fallback;
}

/** Build `pathname` + `searchStr` for navigate state. */
export function hrefFromLocationParts(
  pathname: string,
  searchStr = "",
): string {
  if (!searchStr) return pathname;
  return `${pathname}${searchStr.startsWith("?") ? searchStr : `?${searchStr}`}`;
}

/** Test helper — clear in-memory return hrefs. */
export function resetListReturnHrefsForTests(): void {
  hrefByKey.clear();
}
