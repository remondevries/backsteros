"use client";

import { BreadcrumbChromeSkeleton as SharedBreadcrumbChromeSkeleton } from "@backsteros/ui";

import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

/**
 * Same chrome slot as NavigationBreadcrumb — keeps the 36px header reserved
 * while RegisterBreadcrumbChrome catches up after navigation / Suspense.
 */
export function BreadcrumbChromeSkeleton() {
  if (isMobileShellBuildActive()) {
    return null;
  }

  return <SharedBreadcrumbChromeSkeleton />;
}
