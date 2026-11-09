import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  isMeetingRoomPath,
  parseMeetingRoomMeetingId,
} from "@backsteros/ui";

import {
  currentWindowNavigationHref,
  parseNavigationPathname,
} from "../lib/pending-navigation-routes";
import {
  getOpenRoomMeetingIds,
  getOpenRoomMeetingIdsEpoch,
  nextVisitedRoomMeetingIds,
  resolveActiveRoomMeetingId,
  subscribeOpenRoomMeetingIds,
} from "../lib/room-session-keep-alive";
import {
  getVisibleKeepAliveSurface,
  getWarmKeepAliveEpoch,
  subscribeWarmKeepAlive,
} from "../lib/shell-warm-keep-alive";
import { MeetingRoomSession } from "../screens/meeting-room-session";

/**
 * Keeps one Director session mounted per room tab that has been opened this
 * session. Visible room UI (Director + breadcrumb chrome) only while that room
 * route is the shell's trusted active location and no warm keep-alive section
 * is covering the stage. Backgrounded sessions stay LiveKit-connected.
 *
 * Active room id follows warm visibility + address bar for warm flips (TanStack
 * can lag on `/…/room`). For outlet→outlet (Room → Task-email) it also reads
 * the live router pathname so a lagging window cannot keep Director covering
 * EmailPage.
 */
export function RoomSessionKeepAlive() {
  useSyncExternalStore(
    subscribeOpenRoomMeetingIds,
    getOpenRoomMeetingIdsEpoch,
    () => 0,
  );
  useSyncExternalStore(
    subscribeWarmKeepAlive,
    getWarmKeepAliveEpoch,
    () => 0,
  );
  const routerPathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const openIds = getOpenRoomMeetingIds();
  const openIdKey = openIds.join("\0");
  const visibleSurface = getVisibleKeepAliveSurface();
  const windowPathname = parseNavigationPathname(
    currentWindowNavigationHref(),
  );

  const activeMeetingId = useMemo(
    () =>
      resolveActiveRoomMeetingId({
        visibleKeepAliveSurface: visibleSurface,
        pathname: windowPathname,
        routerPathname,
        isRoomPath: isMeetingRoomPath,
        parseMeetingId: parseMeetingRoomMeetingId,
      }),
    [visibleSurface, windowPathname, routerPathname],
  );

  const [visitedIds, setVisitedIds] = useState<string[]>([]);

  useEffect(() => {
    setVisitedIds((current) => {
      const next = nextVisitedRoomMeetingIds(
        current,
        openIds,
        activeMeetingId,
      );
      if (
        next.length === current.length &&
        next.every((id, index) => id === current[index])
      ) {
        return current;
      }
      return next;
    });
    // openIdKey tracks open-tab membership; openIds is read from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeetingId, openIdKey]);

  const mountedIds = useMemo(
    () => visitedIds.filter((id) => openIds.includes(id)),
    [visitedIds, openIds],
  );

  if (mountedIds.length === 0) return null;

  return (
    <div
      className={[
        "room-session-keep-alive-layer",
        activeMeetingId ? "is-active" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-active-meeting-id={activeMeetingId ?? undefined}
      aria-hidden={activeMeetingId ? undefined : true}
    >
      {mountedIds.map((meetingId) => (
        <MeetingRoomSession
          key={meetingId}
          meetingRouteParam={meetingId}
          active={activeMeetingId === meetingId}
        />
      ))}
    </div>
  );
}
