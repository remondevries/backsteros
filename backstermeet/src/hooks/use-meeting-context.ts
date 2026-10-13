import { useCallback, useMemo, useState } from "react";

export type MeetingContext = {
  meetingId: string | null;
  meetingTitle: string | null;
  meetingStart: Date | null;
  selectMeeting: (next: {
    meetingId: string;
    title?: string | null;
    startAt?: string | null;
  }) => void;
};

function parseMeetingStart(raw: string | null): Date | null {
  if (!raw?.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readFromLocation(): {
  meetingId: string | null;
  meetingTitle: string | null;
  meetingStart: Date | null;
} {
  const params = new URLSearchParams(window.location.search);
  const meetingId =
    params.get("meetingId")?.trim() || params.get("meeting")?.trim() || null;
  const meetingTitle = params.get("title")?.trim() || null;
  const meetingStart = parseMeetingStart(params.get("start"));
  return { meetingId, meetingTitle, meetingStart };
}

/** Launch + in-app room navigation via query string (same id guests use on /meet/…). */
export function useMeetingContext(): MeetingContext {
  const [snapshot, setSnapshot] = useState(readFromLocation);

  const selectMeeting = useCallback(
    (next: {
      meetingId: string;
      title?: string | null;
      startAt?: string | null;
    }) => {
      const id = next.meetingId.trim();
      if (!id) return;
      const url = new URL(window.location.href);
      url.searchParams.set("meetingId", id);
      const title = next.title?.trim();
      if (title) url.searchParams.set("title", title);
      else url.searchParams.delete("title");
      const startAt = next.startAt?.trim();
      if (startAt) url.searchParams.set("start", startAt);
      else url.searchParams.delete("start");
      window.history.replaceState({}, "", url);
      setSnapshot(readFromLocation());
    },
    [],
  );

  return useMemo(
    () => ({
      ...snapshot,
      selectMeeting,
    }),
    [snapshot, selectMeeting],
  );
}
