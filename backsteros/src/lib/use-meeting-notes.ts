import { usePowerSyncQuery } from "./powersync-context";

/** One-row detail watch — list SQL omits `notes` / `transcription`. */
export const MEETING_NOTES_SQL = `SELECT id, notes, transcription FROM meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1`;

type MeetingNotesRow = {
  id: string;
  notes: string | null;
  transcription: string | null;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Meeting notes + transcription are omitted from list watches, so the detail
 * pane must read them on its own. PowerSync already syncs both columns.
 */
export function useDesktopMeetingNotes(
  meetingId: string | null | undefined,
  options?: { enabled?: boolean },
): { notes: string; transcription: string; loading: boolean } {
  const enabled = options?.enabled !== false;
  const id = meetingId?.trim() || null;
  const local = usePowerSyncQuery<MeetingNotesRow>(
    enabled && id ? MEETING_NOTES_SQL : null,
    enabled && id ? [id] : [],
  );
  const row = local.data?.[0] ?? null;
  return {
    notes: row ? asText(row.notes) : "",
    transcription: row ? asText(row.transcription) : "",
    loading: local.loading,
  };
}
