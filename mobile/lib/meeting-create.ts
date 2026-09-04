import type { BacksterosApiClient } from "@backsteros/api-client";
import type { Meeting } from "@backsteros/contracts";

import { entityPatchPath, toSnakeFields } from "./entity-mutations";
import { resolveEntityNumberAfterLocalCreate } from "./resolve-entity-number-after-local-create";
import { shouldWriteEntityViaPowerSync } from "./powersync-write-path";

export type MobileMeetingCreatePowerSync = {
  ready: boolean;
  connected?: boolean;
  preferRestWrites?: boolean;
  flushCrudUpload?: () => Promise<void>;
  patchMeeting?: (id: string, values: Record<string, unknown>) => Promise<void>;
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

  if (
    shouldWriteEntityViaPowerSync(powerSync) &&
    powerSync.createMetadata
  ) {
    const id = await powerSync.createMetadata(
      "meetings",
      toSnakeFields({ ...body, number: null }),
    );
    const number = await resolveEntityNumberAfterLocalCreate(
      client,
      {
        connected: Boolean(powerSync.connected),
        flushCrudUpload: powerSync.flushCrudUpload,
      },
      entityPatchPath("meetings", id),
      powerSync.patchMeeting
        ? async (assigned) => {
            await powerSync.patchMeeting!(id, { number: assigned });
          }
        : undefined,
    );
    return { id, number };
  }

  const meeting = await client.requestJson<Meeting>("/api/v1/meetings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { id: meeting.id, number: meeting.number ?? null };
}
