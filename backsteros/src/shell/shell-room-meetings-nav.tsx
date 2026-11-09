import { useCallback, useMemo } from "react";

import {
  CalendarMeetingsSidePanelView,
  normalizeTabHref,
  type MeetingListItem,
  type ProductTab,
} from "@backsteros/ui";

import { requestOpenHrefInNewTab } from "../lib/open-href-in-new-tab";
import { useDesktopWorkspaceMeta } from "../lib/workspace-data";

/**
 * Agenda meetings list for the product sidebar while a Director room tab is
 * active — reuses the calendar right-rail list styling/component.
 *
 * `keyboardNavigationEnabled` must follow the active room route. The pane stays
 * mounted for crossfade, but leaving it enabled steals CONTENT-zone j/k from
 * Inbox/Messages after Room → Inbox (exiting pane still has layout rects).
 */
export function ShellRoomMeetingsNav({
  selectedMeetingId,
  tabs,
  onActivateTab,
  keyboardNavigationEnabled = false,
}: {
  selectedMeetingId: string | null;
  tabs: ProductTab[];
  onActivateTab: (tabId: string) => void;
  /** True only while a room product tab is the active route. */
  keyboardNavigationEnabled?: boolean;
}) {
  const { meetings, ready } = useDesktopWorkspaceMeta();

  const listMeetings = useMemo(
    () => meetings as MeetingListItem[],
    [meetings],
  );

  const openMeetingRoom = useCallback(
    (meetingId: string) => {
      const href = `/calendar/meetings/${encodeURIComponent(meetingId)}/room`;
      const normalized = normalizeTabHref(href);
      const existing = tabs.find(
        (tab) => normalizeTabHref(tab.href) === normalized,
      );
      if (existing) {
        onActivateTab(existing.id);
        return;
      }
      // Same convention as Start room on meeting detail.
      requestOpenHrefInNewTab(href);
    },
    [onActivateTab, tabs],
  );

  return (
    <CalendarMeetingsSidePanelView
      meetings={listMeetings}
      viewMode="list"
      loading={!ready}
      selectedMeetingId={selectedMeetingId}
      onMeetingOpen={openMeetingRoom}
      emptyLabel="No Agenda meetings yet."
      keyboardNavigationEnabled={keyboardNavigationEnabled}
    />
  );
}
