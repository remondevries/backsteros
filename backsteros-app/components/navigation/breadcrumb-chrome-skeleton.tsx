"use client";

import { ContentChromeHeader } from "@/components/shell/content-chrome-header";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

/**
 * Same chrome slot as NavigationBreadcrumb — keeps the 36px header reserved
 * while RegisterBreadcrumbChrome catches up after navigation / Suspense.
 */
export function BreadcrumbChromeSkeleton() {
  if (isMobileShellBuildActive()) {
    return null;
  }

  return (
    <ContentChromeHeader className="app-breadcrumb-header">
      <nav
        aria-busy="true"
        aria-label="Loading breadcrumb"
        className="breadcrumb-chrome-skeleton min-w-0"
      >
        <span className="breadcrumb-chrome-skeleton-crumb breadcrumb-chrome-skeleton-crumb--short" />
        <span className="breadcrumb-chrome-skeleton-sep" aria-hidden="true">
          ›
        </span>
        <span className="breadcrumb-chrome-skeleton-crumb breadcrumb-chrome-skeleton-crumb--long" />
      </nav>
    </ContentChromeHeader>
  );
}
