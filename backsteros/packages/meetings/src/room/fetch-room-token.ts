import type { MeetingRoomToken } from "@backsteros/contracts";

import type {
  FetchMeetingRoomTokenOptions,
  MeetingRoomCredentials,
} from "./types";

/** POST /api/v1/meetings/:id/room-token — secrets stay on core. */
export async function fetchMeetingRoomToken(
  options: FetchMeetingRoomTokenOptions,
): Promise<MeetingRoomCredentials> {
  const meetingId = options.meetingId.trim();
  if (!meetingId) {
    throw new Error("meetingId is required");
  }
  const body: { role?: "host" | "guest"; displayName?: string } = {};
  if (options.role) body.role = options.role;
  if (options.displayName?.trim()) {
    body.displayName = options.displayName.trim();
  }
  const payload = await options.requestJson<MeetingRoomToken>(
    `/api/v1/meetings/${encodeURIComponent(meetingId)}/room-token`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!payload.token?.trim() || !payload.url?.trim() || !payload.room?.trim()) {
    throw new Error("Core returned an incomplete meeting room token");
  }
  return {
    token: payload.token,
    url: payload.url,
    room: payload.room,
    meetingId: payload.meetingId || meetingId,
    provider: payload.provider ?? "livekit",
  };
}
