import type { BacksterosApiClient } from "@backsteros/api-client";
import type { SyncMeetingToGoogleCalendarResult } from "@backsteros/contracts";

/** POST /api/v1/meetings/:id/sync-google-calendar */
export async function syncMeetingToGoogleCalendar(
  client: BacksterosApiClient,
  meetingId: string,
): Promise<SyncMeetingToGoogleCalendarResult> {
  return client.requestJson<SyncMeetingToGoogleCalendarResult>(
    `/api/v1/meetings/${encodeURIComponent(meetingId)}/sync-google-calendar`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
}
