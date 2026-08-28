export type { PendingPageSurface, ResolvedAppHref } from "./resolve-app-href";
export {
  formatResolvedAppHref,
  normalizeNavigationHref,
  parseNavigationPathname,
  resolveAppHref,
  surfaceForPathname,
} from "./resolve-app-href";

import {
  normalizeNavigationHref,
  resolveAppHref,
  type PendingPageSurface,
} from "./resolve-app-href";

/** Live window href (`/tasks?due=today`). */
export function currentWindowNavigationHref(): string {
  if (typeof window === "undefined") return "/";
  return normalizeNavigationHref(
    `${window.location.pathname}${window.location.search}`,
  );
}

/**
 * Surface for an href. Prefer {@link resolveAppHref} when you also need the
 * expanded pathname — this is a thin read of `resolveAppHref(href).surface`.
 */
export function resolvePendingPageSurface(href: string): PendingPageSurface {
  return resolveAppHref(href).surface;
}
