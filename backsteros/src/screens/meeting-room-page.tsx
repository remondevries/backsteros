/**
 * Route slot for `/calendar/meetings/:id/room`.
 *
 * The LiveKit Director session is hosted by {@link RoomSessionKeepAlive} so it
 * survives tab switches. This outlet only anchors layout (:has flex lock) while
 * a room route is active.
 */
export function MeetingRoomPage() {
  return (
    <div
      className="meeting-room-page meeting-room-page--route-slot flex min-h-0 flex-1 flex-col"
      data-meeting-room-state="hosted"
      style={{ height: "100%", minHeight: 0 }}
      aria-hidden="true"
    />
  );
}
