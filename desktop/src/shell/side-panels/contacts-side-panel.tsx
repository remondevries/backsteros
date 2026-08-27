

import {
  ContactsSidePanelView,
  contactMatchesSlug,
  getContactSidePanelHref,
  getSelectedContactSlugFromPathname,
  getUniqueListItemRouteParam,
  groupItemsByAlphaLetter,
  type ContactsSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";

import type { SidePanelNavProps } from "./types.js";

export function DesktopContactsSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  ContactsSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps"
> &
  SidePanelNavProps) {
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedContactSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (items.find((item) => contactMatchesSlug(item, selectedSlug))?.id ?? null)
    : null;
  // Match DOM order from alpha-grouped rendering so j/k follows the visible list.
  const itemIds = groupItemsByAlphaLetter(items).flatMap(([, entries]) =>
    entries.map((item) => item.id),
  );
  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds,
      selectedId,
      onNavigate: (itemId) => {
        const item = items.find((entry) => entry.id === itemId);
        if (item) {
          onNavigate(
            getContactSidePanelHref(
              getUniqueListItemRouteParam(item, items),
              pathname,
            ),
          );
        }
      },
      enabled: items.length > 0,
    });
  return (
    <ContactsSidePanelView
      {...viewProps}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}
