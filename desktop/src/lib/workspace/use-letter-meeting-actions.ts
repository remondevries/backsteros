import { useCallback } from "react";
import type {
  Letter as ApiLetter,
  Meeting as ApiMeeting,
} from "@backsteros/contracts";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { optimisticLocalMetadataCreate } from "./optimistic-local-metadata-create";
import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

/** Letter and meeting creation flows. */
export function useWorkspaceLetterMeetingActions({
  authenticated,
  client,
  powerSync,
  toSnakeFields,
  setApiLetters,
  setApiMeetings,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  toSnakeFields: (values: Record<string, unknown>) => Record<string, unknown>;
  setApiLetters: ApiRowsSetter<ApiLetter>;
  setApiMeetings: ApiRowsSetter<ApiMeeting>;
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
    }) => {
      if (!authenticated) throw new Error("Sign in to create meetings.");
      const meetingBody = {
        title: input.title?.trim() || "New meeting",
        summary: input.summary ?? null,
        notes: input.notes ?? null,
        transcription: input.transcription ?? null,
        ...(input.status ? { status: input.status } : {}),
        startAt: input.startAt,
        endAt: input.endAt,
      };
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const meeting = {
          id,
          number: null,
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
        const { number } = await optimisticLocalMetadataCreate({
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
          resolveNumberAfterUpload: {
            client,
            powerSync,
            fetchPath: `/api/v1/meetings/${encodeURIComponent(id)}`,
            setters: [setApiMeetings],
          },
        });
        return { id: meeting.id, number };
      }

      const meeting = await client.requestJson<ApiMeeting>("/api/v1/meetings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(meetingBody),
      });
      setApiMeetings((rows) => {
        if (!rows) return [meeting];
        if (rows.some((entry) => entry.id === meeting.id)) {
          return rows.map((entry) =>
            entry.id === meeting.id ? meeting : entry,
          );
        }
        return [meeting, ...rows];
      });
      return { id: meeting.id, number: meeting.number };
    },
    [authenticated, client, powerSync, setApiMeetings, toSnakeFields],
  );

  return { createLetter, createMeeting };
}
