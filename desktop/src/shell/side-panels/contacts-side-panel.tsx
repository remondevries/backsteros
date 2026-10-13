import {
  CONTACTS_SIDE_PANEL_ALL_ID,
  ContactsSidePanelView,
  getContactsGroupHref,
  type ContactsSidePanelViewProps,
} from "@backsteros/ui";

import { useDesktopSidePanelListNav } from "../../lib/use-desktop-side-panel-list-nav";

import type { SidePanelNavProps } from "./types.js";

export function DesktopContactsSidePanel({
  onNavigate,
  getGroupHref = getContactsGroupHref,
  ...viewProps
}: ContactsSidePanelViewProps & SidePanelNavProps) {
  const { groups, selectedGroupId = null } = viewProps;
  const selectedId =
    selectedGroupId == null ? CONTACTS_SIDE_PANEL_ALL_ID : selectedGroupId;
  const itemIds = [
    CONTACTS_SIDE_PANEL_ALL_ID,
    ...groups.map((group) => group.id),
  ];
  const { highlightedId } = useDesktopSidePanelListNav({
    itemIds,
    selectedId,
    pathname: getGroupHref(null).split("?")[0] || "/contacts",
    onNavigate: (itemId) => {
      if (itemId === CONTACTS_SIDE_PANEL_ALL_ID) {
        onNavigate(getGroupHref(null));
        return;
      }
      onNavigate(getGroupHref(itemId));
    },
    enabled: itemIds.length > 0,
  });
  return (
    <ContactsSidePanelView
      {...viewProps}
      getGroupHref={getGroupHref}
      highlightedId={highlightedId}
    />
  );
}
