import { fetchMeetingRoomToken } from "./fetch-room-token";
import type { MeetingRoomMediaProvider } from "./types";

/** Current media backend — LiveKit SFU shared with the client portal. */
export const liveKitMeetingRoomProvider: MeetingRoomMediaProvider = {
  id: "livekit",
  fetchCredentials: fetchMeetingRoomToken,
};

/** Active provider. Replace when evaluating Cloudflare RealtimeKit, etc. */
export let activeMeetingRoomProvider: MeetingRoomMediaProvider =
  liveKitMeetingRoomProvider;

export function setMeetingRoomMediaProvider(
  provider: MeetingRoomMediaProvider,
): void {
  activeMeetingRoomProvider = provider;
}
