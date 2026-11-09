import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  isMeetingRoomPath,
  parseMeetingRoomMeetingId,
} from "@backsteros/ui";

import {
  getOpenRoomMeetingIds,
  getOpenRoomMeetingIdsEpoch,
  nextVisitedRoomMeetingIds,
  subscribeOpenRoomMeetingIds,
} from "../lib/room-session-keep-alive";
import { MeetingRoomSession } from "../screens/meeting-room-session";

/**
 * Keeps one Director session mounted per room tab that has been opened this
 * session. Visible only for the active room route; backgrounded sessions stay
 * LiveKit-connected so cam/mic + tab indicators survive tab switches.
 *
 * Sessions are created on first visit (not merely because a stale room tab
 * exists in localStorage) and destroyed when that product tab closes.
 */
export function RoomSessionKeepAlive() {
  useSyncExternalStore(
    subscribeOpenRoomMeetingIds,
    getOpenRoomMeetingIdsEpoch,
    () => 0,
  );
  const openIds = getOpenRoomMeetingIds();
  const openIdKey = openIds.join("\0");
  const { pathname } = useLocation();
  const activeMeetingId = useMemo(() => {
    if (!isMeetingRoomPath(pathname)) return null;
    return parseMeetingRoomMeetingId(pathname);
  }, [pathname]);

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
