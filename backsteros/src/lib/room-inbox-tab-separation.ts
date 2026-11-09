/**
 * Ownership flags for Room ↔ Inbox/Messages tab separation.
 *
 * Concrete bug (traced): ShellRoomMeetingsNav stayed mounted after leaving a
 * room with `keyboardNavigationEnabled` hard-coded true, registering the
 * CONTENT keyboard zone. The exiting sidebar pane is `position:absolute` with
 * non-empty client rects and was not `inert`. When `checkVisibility` is absent
 * or ignores opacity (some WKWebView paths), j/k still targeted meetings and
 * fought Inbox/Messages side-panel / content lists.
 */

import {
  resolveLeftSidePanelDest,
  type LeftSidePanelDest,
} from "./left-side-panel-dest.js";
import {
  resolveRoomTabSeparation,
  type RoomTabSeparationSnapshot,
} from "./room-session-keep-alive.js";

/** Meetings rail may receive j/k only while a room route is the active tab. */
export function roomSidebarMeetingsKeyboardEnabled(
  roomRouteActive: boolean,
): boolean {
  return roomRouteActive;
}

/** Exiting sidebar-nav-swap panes must be inert so keyboard-nav visibility rejects them. */
export function sidebarNavPaneInert(paneIsActive: boolean): boolean {
  return !paneIsActive;
}

export type RoomInboxSeparationStep = {
  label: string;
  pathname: string;
  search?: string;
  activeMeetingId: string | null;
  mountedRoomIds: readonly string[];
  visibleSurface: "inbox" | "communication" | null;
  inInboxPanel: boolean;
};

export type RoomInboxSeparationState = {
  room: RoomTabSeparationSnapshot;
  meetingsKeyboardEnabled: boolean;
  meetingsNavInert: boolean;
  workspaceNavInert: boolean;
  sidePanelDest: LeftSidePanelDest | null;
};

/** Resolve shell ownership for one navigation step (behavioral fixture). */
export function resolveRoomInboxSeparationState(
  step: RoomInboxSeparationStep,
): RoomInboxSeparationState {
  const roomRouteActive = Boolean(step.activeMeetingId);
  const room = resolveRoomTabSeparation({
    activeMeetingId: step.activeMeetingId,
    mountedIds: step.mountedRoomIds,
  });
  const sidePanelDest = resolveLeftSidePanelDest({
    pathname: step.pathname,
    search: step.search ?? "",
    inInboxPanel: step.inInboxPanel,
    inCommunicationPanel: step.visibleSurface === "communication",
    financeSection: false,
    showSidePanel:
      step.visibleSurface === "inbox" ||
      step.pathname === "/inbox" ||
      step.pathname.startsWith("/inbox/"),
    visibleSurface: step.visibleSurface,
    outletTransitionPending: false,
    windowHref: `${step.pathname}${step.search ?? ""}`,
  });

  return {
    room,
    meetingsKeyboardEnabled:
      roomSidebarMeetingsKeyboardEnabled(roomRouteActive),
    meetingsNavInert: sidebarNavPaneInert(roomRouteActive),
    workspaceNavInert: sidebarNavPaneInert(!roomRouteActive),
    sidePanelDest,
  };
}
