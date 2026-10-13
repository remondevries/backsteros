import {
  SocialSidePanelView,
  getSocialHref,
  getSelectedSocialSlugFromPathname,
  getUniqueListItemRouteParam,
  groupItemsByAlphaLetter,
  resolveListItemFromSlug,
  type SocialSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";

import type { SidePanelNavProps } from "./types.js";

export function DesktopSocialSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  SocialSidePanelViewProps,
  "highlightedId" | "listRef" | "listContainerProps"
> &
  SidePanelNavProps) {
  const { pathname, items } = viewProps;
  const selectedSlug = getSelectedSocialSlugFromPathname(pathname);
  const selectedId = selectedSlug
    ? (resolveListItemFromSlug(items, selectedSlug)?.id ?? null)
    : null;
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
            getSocialHref(getUniqueListItemRouteParam(item, items)),
          );
        }
      },
      enabled: items.length > 0,
    });
  return (
    <SocialSidePanelView
      {...viewProps}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}
