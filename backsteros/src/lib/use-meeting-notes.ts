import { useEffect, useState } from "react";
import type { BacksterosApiClient } from "@backsteros/api-client";
import type { Meeting as ApiMeeting } from "@backsteros/contracts";

import { useDesktopApi } from "./api-context";
import { usePowerSyncQuery } from "./powersync-context";
import { createSessionLruCache } from "./session-lru-cache";

/** One-row local read — may be empty once sync-config omits notes/transcription. */
export const MEETING_NOTES_SQL = `SELECT id, notes, transcription FROM meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1`;

type MeetingNotesRow = {
  id: string;
  notes: string | null;
  transcription: string | null;
};

type MeetingNotesPayload = {
  notes: string;
  transcription: string;
};

const notesCache = createSessionLruCache<MeetingNotesPayload>(32);
const inflight = new Map<string, Promise<MeetingNotesPayload | null>>();

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function peekMeetingNotesCache(meetingId: string): MeetingNotesPayload | null {
  return notesCache.peek(meetingId);
}

export function writeMeetingNotesCache(
  meetingId: string,
  notes: string,
  transcription: string,
): void {
  notesCache.set(meetingId, { notes, transcription });
}

function fetchMeetingNotes(
  client: BacksterosApiClient,
  meetingId: string,
): Promise<MeetingNotesPayload | null> {
  const id = meetingId.trim();
  if (!id) return Promise.resolve(null);

  const cached = notesCache.peek(id);
  if (cached != null) return Promise.resolve(cached);

  const pending = inflight.get(id);
  if (pending) return pending;

  const request = client
    .requestJson<ApiMeeting>(`/api/v1/meetings/${encodeURIComponent(id)}`)
    .then((meeting) => {
      const payload: MeetingNotesPayload = {
        notes: asText(meeting.notes),
        transcription: asText(meeting.transcription),
      };
      notesCache.set(id, payload);
      return payload;
    })
    .catch((error) => {
      console.warn(
        `[meeting-notes] failed to fetch ${id}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    })
    .finally(() => {
      inflight.delete(id);
    });

  inflight.set(id, request);
  return request;
}

/**
 * Meeting notes + transcription are omitted from list watches and from the
 * PowerSync stream (OS-163 / audit #4). Prefer REST detail; keep a one-row
 * local watch only as a transitional cache while old SQLite rows still hold
 * text from a prior sync-config.
 */
export function useDesktopMeetingNotes(
  meetingId: string | null | undefined,
  options?: { enabled?: boolean },
): { notes: string; transcription: string; loading: boolean } {
  const enabled = options?.enabled !== false;
  const id = meetingId?.trim() || null;
  const { client } = useDesktopApi();

  const local = usePowerSyncQuery<MeetingNotesRow>(
    enabled && id ? MEETING_NOTES_SQL : null,
    enabled && id ? [id] : [],
  );
  const localRow = local.data?.[0] ?? null;
  const localNotes = localRow ? asText(localRow.notes) : "";
  const localTranscription = localRow ? asText(localRow.transcription) : "";
  const hasLocalText =
    Boolean(localRow) && (localNotes.length > 0 || localTranscription.length > 0);

  const [activeId, setActiveId] = useState(id);
  const [restPayload, setRestPayload] = useState<MeetingNotesPayload | null>(
    null,
  );
  const [restLoading, setRestLoading] = useState(false);

  if (id !== activeId) {
    setActiveId(id);
    setRestPayload(null);
    setRestLoading(false);
  }

  const needRest = Boolean(enabled && id && !hasLocalText && !local.loading);

  useEffect(() => {
    if (!id || !enabled || !needRest) {
      setRestLoading(false);
      return;
    }
    let cancelled = false;
    setRestLoading(true);
    void fetchMeetingNotes(client, id).then((next) => {
      if (cancelled) return;
      if (next != null) setRestPayload(next);
      setRestLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, id, needRest]);

  const cached = id ? peekMeetingNotesCache(id) : null;
  const notes = hasLocalText
    ? localNotes
    : (restPayload?.notes ?? cached?.notes ?? "");
  const transcription = hasLocalText
    ? localTranscription
    : (restPayload?.transcription ?? cached?.transcription ?? "");

  const loading = Boolean(
    enabled &&
      id &&
      !hasLocalText &&
      restPayload == null &&
      cached == null &&
      (local.loading || (needRest && restLoading)),
  );

  return { notes, transcription, loading };
}
