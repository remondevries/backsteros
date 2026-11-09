/**
 * Media-backend-agnostic meeting room types.
 * LiveKit is the current provider; Cloudflare RealtimeKit (etc.) can implement
 * the same {@link MeetingRoomMediaProvider} later without rewriting Director UI.
 *
 * Swap path for a new provider:
 * 1. Implement {@link MeetingRoomMediaProvider#fetchCredentials} (or map core’s
 *    `provider` field when core mints RealtimeKit tokens).
 * 2. Register it with {@link setMeetingRoomMediaProvider}.
 * 3. Replace the LiveKit session behind `useDirectorRoom` /
 *    `connectHostMeetingRoom` — keep {@link DirectorRoom} on the facade only.
 * 4. Keep {@link ./protocol.ts} message/attribute names stable so the portal
 *    guest path does not change.
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
  /** Participant identity (unique per concurrent join). */
  identity?: string;
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
 * Credentials + connect entry for the active media backend.
 * Session control (publish tracks, data channel) still lives in the Director
 * LiveKit hook until a RealtimeKit adapter lands — see package report / index.
 */
export type MeetingRoomMediaProvider = {
  readonly id: MeetingRoomProviderId;
  fetchCredentials(
    options: FetchMeetingRoomTokenOptions,
  ): Promise<MeetingRoomCredentials>;
};
