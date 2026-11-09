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
  onClick,
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  // Warm keep-alive flip (same as sidebar) — raw TanStack Link rematches the
  // router and can leave lastHref stuck on the detail while the URL goes list.
  return (
    <RouterLink to={to} className={className} onClick={onClick}>
      {children}
    </RouterLink>
  );
}

export type UseDesktopSectionBreadcrumbOptions = {
  /** Control rendered immediately after the crumb trail (e.g. room open). */
  leading?: ReactNode;
  /** Truly-centered chrome (e.g. Local / Screenshare on room tabs). */
  center?: ReactNode;
  /** Extra controls rendered in the chrome header before the ⋯ menu. */
  actions?: ReactNode;
  /**
   * When true, omit the ⋯ entity-actions slot from the breadcrumb chrome
   * (e.g. when the slot is already placed inside a detail panel header).
   */
  hideEntityActionsSlot?: boolean;
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
  /** Chrome registration priority when multiple trails register at once. */
  priority?: number;
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
  const leading = options?.leading;
  const center = options?.center;
  const actions = options?.actions;
  const hideEntityActionsSlot = options?.hideEntityActionsSlot ?? false;
  const trailingPanel = options?.trailingPanel;
  const className = options?.className;
  const enabled = options?.enabled !== false;
  const priority = options?.priority ?? 0;

  const header = useMemo(() => {
    if (!enabled || items.length === 0) return null;
    const hasActions = Boolean(actions) || !hideEntityActionsSlot;
    return (
      <ContentChromeHeader
        className={className}
        leading={leading}
        center={center}
        actions={
          hasActions ? (
            <>
              {actions ? (
                <div className="content-chrome-header__section-tabs">
                  {actions}
                </div>
              ) : null}
              {hideEntityActionsSlot ? null : <EntityHeaderActionsSlot />}
            </>
          ) : null
        }
        trailingPanel={trailingPanel}
      >
        <ContentBreadcrumb items={items} Link={ChromeLink} />
      </ContentChromeHeader>
    );
    // itemsKey tracks label/href identity for the trail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    actions,
    center,
    className,
    enabled,
    hideEntityActionsSlot,
    itemsKey,
    leading,
    trailingPanel,
  ]);

  useRegisterChromeHeader(enabled ? header : false, { priority });
}
