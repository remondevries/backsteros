/**
 * BacksterOS meetings media + Director tools.
 * Room join tokens come from core (`POST /api/v1/meetings/:id/room-token`).
 * LiveKit is the default media provider — swap via {@link setMeetingRoomMediaProvider}.
 */

export {
  activeMeetingRoomProvider,
  fetchMeetingRoomToken,
  liveKitMeetingRoomProvider,
  setMeetingRoomMediaProvider,
  type FetchMeetingRoomTokenOptions,
  type MeetingRoomCredentials,
  type MeetingRoomMediaProvider,
  type MeetingRoomProviderId,
  type MeetingRoomRole,
} from "./room/index";

export {
  DirectorRoom,
  type DirectorRoomProps,
  useDirectorLiveKit,
  visitorNotice,
  connectHostRoom,
  disconnectHostRoom,
  enqueueHostLiveKitTask,
  type ConnectHostRoomOptions,
  type GuestFeed,
  type GuestPhase,
  guestMeetUrl,
  guestPortalBaseUrl,
  filterHostMeetings,
  formatHostMeetingWhen,
  type HostMeeting,
  PRESENTATION_KINDS,
  PRESENTATION_LABELS,
  PRESENTATION_ATTR,
  getPresentationDeliveryMode,
  presentationUsesUrlSync,
  type PresentationKind,
  type PresentationDeliveryMode,
} from "./director/index";
