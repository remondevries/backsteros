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
  MEETING_ROOM_ATTR,
  MEETING_ROOM_GUEST_IDENTITY_PREFIX,
  MEETING_ROOM_HOST_IDENTITY_PREFIX,
  decodeMeetingRoomDataMessage,
  encodeMeetingRoomDataMessage,
  isMeetingRoomGuestIdentity,
  isMeetingRoomHostIdentity,
  type FetchMeetingRoomTokenOptions,
  type MeetingRoomCredentials,
  type MeetingRoomMediaProvider,
  type MeetingRoomProviderId,
  type MeetingRoomRole,
  type MeetingRoomAttrKey,
  type MeetingRoomDataMessage,
  type MeetingRoomGuestPhase,
} from "./room/index";

export {
  DirectorRoom,
  type DirectorRoomProps,
  useDirectorLiveKit,
  useDirectorRoom,
  visitorNotice,
  connectHostRoom,
  connectHostMeetingRoom,
  disconnectHostRoom,
  disconnectHostMeetingRoom,
  enqueueHostLiveKitTask,
  enqueueHostMeetingRoomTask,
  type ConnectHostRoomOptions,
  type HostMeetingRoomSession,
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
