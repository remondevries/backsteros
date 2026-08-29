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
    pathname: "/contacts",
    onNavigate: (itemId) => {
      if (itemId === CONTACTS_SIDE_PANEL_ALL_ID) {
        onNavigate(getContactsGroupHref(null));
        return;
      }
      onNavigate(getContactsGroupHref(itemId));
    },
    enabled: itemIds.length > 0,
  });
  return (
    <ContactsSidePanelView {...viewProps} highlightedId={highlightedId} />
  );
}
