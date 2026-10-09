import { useCallback } from "react";
import type {
  Letter as ApiLetter,
  Meeting as ApiMeeting,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import {
  PENDING_ENTITY_NUMBER,
  optimisticLocalMetadataCreate,
} from "./optimistic-local-metadata-create";
import { resolveEntityNumberAfterLocalCreate } from "./resolve-entity-number-after-local-create";
import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

const MEETING_CREATE_FORMATS = [
  "video_call",
  "in_person",
  "phone_call",
] as const;

type MeetingCreateFormat = (typeof MEETING_CREATE_FORMATS)[number];

function normalizeMeetingCreateFormat(
  value: unknown,
): MeetingCreateFormat | undefined {
  if (
    typeof value === "string" &&
    (MEETING_CREATE_FORMATS as readonly string[]).includes(value)
  ) {
    return value as MeetingCreateFormat;
  }
  return undefined;
}

/** Letter and meeting creation flows. */
export function useWorkspaceLetterMeetingActions({
  authenticated,
  client,
  powerSync,
  toSnakeFields,
  setApiLetters,
  setApiMeetings,
  rawMeetings,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  toSnakeFields: (values: Record<string, unknown>) => Record<string, unknown>;
  setApiLetters: ApiRowsSetter<ApiLetter>;
  setApiMeetings: ApiRowsSetter<ApiMeeting>;
  rawMeetings: readonly ApiMeeting[];
}) {
  const createLetter = useCallback(
    async (input: {
      title: string;
      body?: string;
      status?: string;
      organizationId?: string | null;
      contactId?: string | null;
      projectId?: string | null;
      dueDate?: string | null;
      receivedDate?: string | null;
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Letter title is required.");
      const body = {
        title,
        projectId: input.projectId ?? null,
        organizationId: input.organizationId ?? null,
        contactId: input.contactId ?? null,
        status: input.status ?? "triage",
        dueDate: input.dueDate ?? null,
        // Default Received Date to today so PDF filing has a date immediately;
        // callers can still override or clear it later.
        receivedDate: input.receivedDate ?? new Date().toISOString(),
        context: input.body?.trim() || null,
        sortOrder: -Date.now(),
      };
      if (!authenticated) throw new Error("Sign in to create letters.");
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const letter = {
          id,
          number: null,
          ...body,
          createdAt: now,
          updatedAt: now,
        } as ApiLetter;
        const applyOptimistic = () => {
          setApiLetters((rows) => {
            if (!rows) return [letter];
            if (rows.some((entry) => entry.id === letter.id)) {
              return rows.map((entry) =>
                entry.id === letter.id ? letter : entry,
              );
            }
            return [letter, ...rows];
          });
        };
        const { number } = await optimisticLocalMetadataCreate({
          id,
          applyOptimistic,
          rollback: () =>
            setApiLetters(
              (rows) => rows?.filter((entry) => entry.id !== id) ?? null,
            ),
          createMetadata: () =>
            powerSync.createMetadata!(
              "letters",
              toSnakeFields(letter as unknown as Record<string, unknown>),
              id,
            ),
          errorLabel: "local letter create",
          resolveNumberAfterUpload: {
            client,
            powerSync,
            fetchPath: `/api/v1/letters/${encodeURIComponent(id)}`,
            setters: [setApiLetters],
          },
        });
        return { id: letter.id, number };
      }

      const letter = await client.requestJson<ApiLetter>("/api/v1/letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setApiLetters((rows) => {
        if (!rows) return [letter];
        if (rows.some((entry) => entry.id === letter.id)) {
          return rows.map((entry) =>
            entry.id === letter.id ? letter : entry,
          );
        }
        return [letter, ...rows];
      });
      return { id: letter.id, number: letter.number };
    },
    [authenticated, client, powerSync, setApiLetters, toSnakeFields],
  );

  const createMeeting = useCallback(
    async (input: {
      title?: string;
      summary?: string | null;
      notes?: string | null;
      transcription?: string | null;
      status?: string;
      startAt: string;
      endAt: string;
      projectId?: string | null;
      organizationId?: string | null;
      attendeeContactIds?: string[];
      format?: MeetingCreateFormat;
      location?: string | null;
      locationOrganizationId?: string | null;
      externalCalendarEventId?: string | null;
    }) => {
      if (!authenticated) throw new Error("Sign in to create meetings.");
      const format = normalizeMeetingCreateFormat(input.format);
      const meetingBody = {
        title: input.title?.trim() || "New meeting",
        summary: input.summary ?? null,
        notes: input.notes ?? null,
        transcription: input.transcription ?? null,
        ...(input.status ? { status: input.status } : {}),
        startAt: input.startAt,
        endAt: input.endAt,
        ...(input.projectId !== undefined
          ? { projectId: input.projectId }
          : {}),
        ...(input.organizationId !== undefined
          ? { organizationId: input.organizationId }
          : {}),
        ...(input.attendeeContactIds !== undefined
          ? { attendeeContactIds: input.attendeeContactIds }
          : {}),
        ...(format ? { format } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.locationOrganizationId !== undefined
          ? { locationOrganizationId: input.locationOrganizationId }
          : {}),
        ...(input.externalCalendarEventId !== undefined
          ? { externalCalendarEventId: input.externalCalendarEventId }
          : {}),
      };
      // Google Convert must persist externalCalendarEventId on the server.
      // A PowerSync-only insert can flash the meeting then vanish when upload
      // drops/rejects the new column — use awaited REST for linked creates.
      const preferRestForExternalLink = Boolean(
        meetingBody.externalCalendarEventId,
      );

      if (
        powerSync.ready &&
        powerSync.createMetadata &&
        !preferRestForExternalLink
      ) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const meeting = {
          id,
          number: PENDING_ENTITY_NUMBER,
          ...meetingBody,
          createdAt: now,
          updatedAt: now,
        } as ApiMeeting;
        const applyOptimistic = () => {
          setApiMeetings((rows) => {
            if (!rows) return [meeting];
            if (rows.some((entry) => entry.id === meeting.id)) {
              return rows.map((entry) =>
                entry.id === meeting.id ? meeting : entry,
              );
            }
            return [meeting, ...rows];
          });
        };
        // Return as soon as the local row exists — number resolution polls the
        // server and made Convert to Event feel stuck on "Converting…".
        await optimisticLocalMetadataCreate({
          id,
          applyOptimistic,
          rollback: () =>
            setApiMeetings(
              (rows) => rows?.filter((entry) => entry.id !== id) ?? null,
            ),
          createMetadata: () =>
            powerSync.createMetadata!(
              "meetings",
              toSnakeFields(meeting as unknown as Record<string, unknown>),
              id,
            ),
          errorLabel: "local meeting create",
        });
        void resolveEntityNumberAfterLocalCreate(
          client,
          powerSync,
          `/api/v1/meetings/${encodeURIComponent(id)}`,
          id,
          setApiMeetings,
        ).catch((error) => {
          console.warn("[desktop] meeting number resolve failed", error);
        });
        return { id: meeting.id, number: null };
      }

      // REST path: optimistic row, await POST so Convert cannot keep a meeting
      // the server is about to reject (then silently roll back).
      const id = crypto.randomUUID().replace(/-/g, "");
      const now = new Date().toISOString();
      const optimistic = {
        id,
        number: PENDING_ENTITY_NUMBER,
        ...meetingBody,
        createdAt: now,
        updatedAt: now,
      } as ApiMeeting;
      setApiMeetings((rows) => {
        if (!rows) return [optimistic];
        if (rows.some((entry) => entry.id === id)) {
          return rows.map((entry) =>
            entry.id === id ? optimistic : entry,
          );
        }
        return [optimistic, ...rows];
      });
      try {
        const meeting = await client.requestJson<ApiMeeting>(
          "/api/v1/meetings",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...meetingBody, id }),
          },
        );
        setApiMeetings((rows) => {
          if (!rows) return [meeting];
          if (rows.some((entry) => entry.id === meeting.id)) {
            return rows.map((entry) =>
              entry.id === meeting.id ? meeting : entry,
            );
          }
          // Server may have ignored client id — replace optimistic row.
          return [meeting, ...rows.filter((entry) => entry.id !== id)];
        });
        return { id: meeting.id, number: meeting.number ?? null };
      } catch (error) {
        setApiMeetings(
          (rows) => rows?.filter((entry) => entry.id !== id) ?? null,
        );
        console.warn("[desktop] meeting create failed", error);
        throw error instanceof Error
          ? error
          : new Error("Meeting create failed");
      }
    },
    [authenticated, client, powerSync, setApiMeetings, toSnakeFields],
  );

  const duplicateMeeting = useCallback(
    async (
      sourceId: string,
      schedule: { startAt: string; endAt: string; status?: string },
    ) => {
      if (!authenticated) throw new Error("Sign in to duplicate meetings.");
      const source = rawMeetings.find((entry) => entry.id === sourceId) ?? null;
      if (!source) {
        throw new Error("Meeting not found.");
      }
      const title = source.title.trim();
      if (!title) throw new Error("Meeting title is required.");

      return createMeeting({
        title,
        summary: source.summary ?? null,
        notes: source.notes ?? null,
        ...(schedule.status ? { status: schedule.status } : {}),
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        projectId: source.projectId ?? null,
        organizationId: source.organizationId ?? null,
        ...(Array.isArray(source.attendeeContactIds) &&
        source.attendeeContactIds.length > 0
          ? { attendeeContactIds: source.attendeeContactIds }
          : {}),
        format: normalizeMeetingCreateFormat(source.format),
        location: source.location ?? null,
        locationOrganizationId: source.locationOrganizationId ?? null,
      });
    },
    [authenticated, createMeeting, rawMeetings],
  );

  return { createLetter, createMeeting, duplicateMeeting };
}
