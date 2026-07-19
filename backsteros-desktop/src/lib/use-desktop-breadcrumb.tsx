import { useMemo, type ReactNode } from "react";
import { NavLink } from "react-router-dom";

import {
  ContentBreadcrumb,
  ContentChromeHeader,
  EntityHeaderActionsSlot,
  useRegisterChromeHeader,
  type ContentBreadcrumbItem,
} from "@backsteros/ui";

function ChromeLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <NavLink to={to} className={className}>
      {children as never}
    </NavLink>
  );
}

/**
 * Registers Letters › … (or Tasks › …) into the product chrome header slot.
 * Includes the entity-actions ⋯ menu when a detail screen has registered delete.
 */
export function useDesktopSectionBreadcrumb(items: ContentBreadcrumbItem[]) {
  const itemsKey = items
    .map((item) => `${item.label}\0${item.href ?? ""}`)
    .join("|");

  const header = useMemo(() => {
    if (items.length === 0) return null;
    return (
      <ContentChromeHeader actions={<EntityHeaderActionsSlot />}>
        <ContentBreadcrumb items={items} Link={ChromeLink} />
      </ContentChromeHeader>
    );
    // itemsKey tracks label/href identity for the trail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  useRegisterChromeHeader(header);
}
