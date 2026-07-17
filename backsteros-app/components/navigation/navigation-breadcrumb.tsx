"use client";

import { EntityHeaderActionsSlot } from "@/components/entity-actions/entity-header-actions-shell";
import { Breadcrumb, type BreadcrumbItem } from "@/components/shell/breadcrumb";
import { ContentChromeHeader } from "@/components/shell/content-chrome-header";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";

type NavigationBreadcrumbProps = {
  /** Section prefix crumbs from the current layout (e.g. Knowledge Base, Projects › …). */
  anchors: BreadcrumbItem[];
  /** Current page detail crumb(s), usually from RegisterProjectBreadcrumb. */
  leafItems?: BreadcrumbItem[];
  className?: string;
  showEntityActions?: boolean;
};

export function NavigationBreadcrumb({
  anchors,
  leafItems = [],
  className,
  showEntityActions = true,
}: NavigationBreadcrumbProps) {
  if (isMobileShellBuildActive()) {
    return null;
  }

  const items = [...anchors, ...leafItems];

  if (items.length === 0) {
    return null;
  }

  return (
    <ContentChromeHeader
      className="app-breadcrumb-header"
      actions={showEntityActions ? <EntityHeaderActionsSlot /> : undefined}
    >
      <Breadcrumb items={items} className={className} />
    </ContentChromeHeader>
  );
}
