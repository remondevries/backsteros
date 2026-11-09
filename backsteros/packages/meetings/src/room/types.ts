/**
 * Media-backend-agnostic meeting room types.
 * LiveKit is the current provider; Cloudflare RealtimeKit (etc.) can implement
 * the same {@link MeetingRoomMediaProvider} later without rewriting Director UI.
 */

export type MeetingRoomProviderId = "livekit";

export type MeetingRoomRole = "host" | "guest";

export type MeetingRoomCredentials = {
  token: string;
  /** Signaling / SFU URL the client connects to. */
  url: string;
  /** SFU room name — always the BacksterOS meeting id. */
  room: string;
  meetingId: string;
  provider: MeetingRoomProviderId;
};

export type FetchMeetingRoomTokenOptions = {
  meetingId: string;
  role?: MeetingRoomRole;
  displayName?: string;
  /**
   * Authenticated JSON request against BacksterOS core
   * (e.g. `client.requestJson` from `@backsteros/api-client`).
   */
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

/**
 * Thin session surface Director tools depend on. Swap the LiveKit adapter
 * for another media backend without changing presentation / lobby UI.
 */
export type MeetingRoomMediaProvider = {
  readonly id: MeetingRoomProviderId;
  fetchCredentials(
    options: FetchMeetingRoomTokenOptions,
  ): Promise<MeetingRoomCredentials>;
};
