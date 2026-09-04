import type { BacksterosApiClient } from "@backsteros/api-client";
import type { Meeting, UpdateMeetingInput } from "@backsteros/contracts";

import {
  shouldSkipRestEntityWrite,
  shouldWriteEntityViaPowerSync,
} from "./powersync-write-path";

export type MobileMeetingPowerSync = {
  ready: boolean;
  connected: boolean;
  preferRestWrites?: boolean;
  patchMeeting: (
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
};

function meetingApiToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "projectId") sqliteValues.project_id = value;
    else if (key === "organizationId") sqliteValues.organization_id = value;
    else if (key === "startAt") sqliteValues.start_at = value;
    else if (key === "endAt") sqliteValues.end_at = value;
    else if (key === "attendeeContactIds") {
      sqliteValues.attendee_contact_ids =
        typeof value === "string"
          ? value
          : JSON.stringify(Array.isArray(value) ? value : []);
    } else if (key === "trackedMinutes") sqliteValues.tracked_minutes = value;
    else if (key === "trackedDurationSeconds") {
      sqliteValues.tracked_duration_seconds = value;
    } else sqliteValues[key] = value;
  }
  return sqliteValues;
}

export async function patchMeetingViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileMeetingPowerSync,
  id: string,
  apiValues: UpdateMeetingInput & Record<string, unknown>,
): Promise<void> {
  if (Object.keys(apiValues).length === 0) return;

  const sqliteValues = meetingApiToSqlite(apiValues);
  if (
    shouldWriteEntityViaPowerSync(powerSync) &&
    Object.keys(sqliteValues).length > 0
  ) {
    try {
      await powerSync.patchMeeting(id, sqliteValues);
    } catch {
      if (shouldSkipRestEntityWrite(powerSync)) {
        throw new Error("Could not update meeting locally.");
      }
    }
  }

  if (shouldSkipRestEntityWrite(powerSync)) {
    return;
  }

  await client.requestJson<Meeting>(
    `/api/v1/meetings/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(apiValues),
    },
  );
}
