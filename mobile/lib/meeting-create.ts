import type { BacksterosApiClient } from "@backsteros/api-client";
import type { Meeting } from "@backsteros/contracts";

import { toSnakeFields } from "./entity-mutations";

export type MobileMeetingCreatePowerSync = {
  ready: boolean;
  createMetadata?: (
    table: "meetings",
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
};

export type CreateMeetingInput = {
  title?: string;
  summary?: string | null;
  notes?: string | null;
  status?: string;
  startAt: string;
  endAt: string;
  projectId?: string | null;
  organizationId?: string | null;
};

export async function createMeetingViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileMeetingCreatePowerSync,
  input: CreateMeetingInput,
): Promise<{ id: string; number: number | null }> {
  const body = {
    title: input.title?.trim() || "New meeting",
    summary: input.summary ?? null,
    notes: input.notes ?? null,
    status: input.status ?? "backlog",
    startAt: input.startAt,
    endAt: input.endAt,
    projectId: input.projectId ?? null,
    organizationId: input.organizationId ?? null,
    sortOrder: -Date.now(),
  };

  if (powerSync.ready && powerSync.createMetadata) {
    const id = await powerSync.createMetadata(
      "meetings",
      toSnakeFields({ ...body, number: null }),
    );
    return { id, number: null };
  }

  const meeting = await client.requestJson<Meeting>("/api/v1/meetings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { id: meeting.id, number: meeting.number ?? null };
}
