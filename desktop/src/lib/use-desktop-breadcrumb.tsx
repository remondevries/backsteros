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

export type UseDesktopSectionBreadcrumbOptions = {
  /** Extra controls rendered in the chrome header before the ⋯ menu. */
  actions?: ReactNode;
  /**
   * Optional right chrome matching a detail panel width (e.g. categories
   * 50/50) so the panel appears to continue into the breadcrumb row.
   */
  trailingPanel?: ReactNode;
  className?: string;
};

/**
 * Registers Letters › … (or Tasks › …) into the product chrome header slot.
 * Includes the entity-actions ⋯ menu when a detail screen has registered actions.
 */
export function useDesktopSectionBreadcrumb(
  items: ContentBreadcrumbItem[],
  options?: UseDesktopSectionBreadcrumbOptions,
) {
  const itemsKey = items
    .map((item) => `${item.label}\0${item.href ?? ""}`)
    .join("|");
  const actions = options?.actions;
  const trailingPanel = options?.trailingPanel;
  const className = options?.className;

  const header = useMemo(() => {
    if (items.length === 0) return null;
    return (
      <ContentChromeHeader
        className={className}
        actions={
          <>
            {actions}
            <EntityHeaderActionsSlot />
          </>
        }
        trailingPanel={trailingPanel}
      >
        <ContentBreadcrumb items={items} Link={ChromeLink} />
      </ContentChromeHeader>
    );
    // itemsKey tracks label/href identity for the trail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, className, itemsKey, trailingPanel]);

  useRegisterChromeHeader(header);
}
