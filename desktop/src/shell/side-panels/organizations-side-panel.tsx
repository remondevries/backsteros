

import {
  OrganizationsSidePanelView,
  getOrganizationSidePanelHref,
  getSelectedOrganizationSlugFromPathname,
  getUniqueListItemRouteParam,
  groupItemsByAlphaLetter,
  resolveListItemFromSlug,
  type OrganizationsSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";

import type { SidePanelNavProps } from "./types.js";

export function DesktopOrganizationsSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  OrganizationsSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps"
> &
  SidePanelNavProps) {
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedOrganizationSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (resolveListItemFromSlug(items, selectedSlug)?.id ?? null)
    : null;
  // Match DOM order from alpha-grouped rendering so j/k follows the visible list.
  const itemIds = groupItemsByAlphaLetter(items).flatMap(([, entries]) =>
    entries.map((item) => item.id),
  );
  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds,
      selectedId,
      pathname,
      onNavigate: (itemId) => {
        const item = items.find((entry) => entry.id === itemId);
        if (item) {
          onNavigate(
            getOrganizationSidePanelHref(
              getUniqueListItemRouteParam(item, items),
              pathname,
            ),
          );
        }
      },
      enabled: items.length > 0,
    });
  return (
    <OrganizationsSidePanelView
      {...viewProps}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}
