import { ContentChromeHeader } from "../content-chrome-header.js";

/**
 * Same chrome slot as ContentBreadcrumb — keeps the header height reserved
 * while RegisterBreadcrumbChrome / useDesktopSectionBreadcrumb catches up.
 * Hosts that hide chrome on mobile should gate rendering themselves.
 */
export function BreadcrumbChromeSkeleton() {
  return (
    <ContentChromeHeader className="app-breadcrumb-header">
      <nav
        aria-busy="true"
        aria-label="Loading breadcrumb"
        className="breadcrumb-chrome-skeleton"
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
