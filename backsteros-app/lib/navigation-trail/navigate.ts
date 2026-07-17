import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** Navigate to a navigation-trail href (desktop path form). */
export function pushNavigationTrailHref(
  router: AppRouterInstance,
  trailHref: string,
): void {
  router.push(trailHref);
}
