import {
  SOCIAL_NAV_ITEMS,
  SocialSidePanelNavView,
  getSelectedSocialNavIdFromPathname,
  resolveSocialSidePanelHref,
  type SocialSidePanelNavViewProps,
} from "@backsteros/ui";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";

import type { SidePanelNavProps } from "./types.js";

export function DesktopSocialSidePanel({
  onNavigate,
  ...viewProps
}: Omit<
  SocialSidePanelNavViewProps,
  "highlightedId" | "listRef" | "listContainerProps" | "onNavigate"
> &
  SidePanelNavProps) {
  const { pathname } = viewProps;
  const selectedId = getSelectedSocialNavIdFromPathname(pathname);
  const itemIds = SOCIAL_NAV_ITEMS.map((item) => item.id);
  const { listRef, highlightedId, listContainerProps } =
    useDesktopSidePanelListNav({
      itemIds,
      selectedId,
      pathname,
      onNavigate: (itemId) => {
        const href = resolveSocialSidePanelHref(itemId);
        if (href) onNavigate(href);
      },
      enabled: itemIds.length > 0,
    });
  return (
    <SocialSidePanelNavView
      {...viewProps}
      listRef={listRef}
      listContainerProps={listContainerProps}
      highlightedId={highlightedId}
    />
  );
}
