import { useMemo, type ReactNode } from "react";

import {
  ContentBreadcrumb,
  ContentChromeHeader,
  EntityHeaderActionsSlot,
  useRegisterChromeHeader,
  type ContentBreadcrumbItem,
} from "@backsteros/ui";

import { RouterLink } from "../shell/app-shell-links";

function ChromeLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  // Warm keep-alive flip (same as sidebar) — raw TanStack Link rematches the
  // router and can leave lastHref stuck on the detail while the URL goes list.
  return (
    <RouterLink to={to} className={className}>
      {children}
    </RouterLink>
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
  /**
   * When false, skip chrome registration (host already owns the trail —
   * e.g. Timetracking / calendar task overlay).
   */
  enabled?: boolean;
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
  const enabled = options?.enabled !== false;

  const header = useMemo(() => {
    if (!enabled || items.length === 0) return null;
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
  }, [actions, className, enabled, itemsKey, trailingPanel]);

  useRegisterChromeHeader(enabled ? header : false);
}
