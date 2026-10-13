/**
 * Public guest portal origin for invite links (email / clipboard).
 * Always the shareable client host — never localhost — so guests can open the lobby.
 */
export function guestPortalBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_GUEST_PORTAL_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://client.lemo-design.com";
}

export function guestMeetUrl(meetingId: string): string {
  return `${guestPortalBaseUrl()}/meet/${encodeURIComponent(meetingId.trim())}`;
}

export type HostMeeting = {
  id: string;
  number: number;
  title: string;
  status: string;
  format: string | null;
  startAt: string | null;
  endAt: string | null;
  createdAt: string | null;
};

const EXCLUDED = new Set(["canceled", "completed", "duplicated"]);
const POST_END_MS = 60 * 60 * 1000;

function parseInstant(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function mapHostMeeting(row: Record<string, unknown>): HostMeeting | null {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const number =
    typeof row.number === "number" && Number.isFinite(row.number)
      ? row.number
      : null;
  if (!id || !title || number == null) return null;
  return {
    id,
    number,
    title,
    status: typeof row.status === "string" ? row.status : "ready_to_start",
    format: typeof row.format === "string" ? row.format : null,
    startAt: typeof row.startAt === "string" ? row.startAt : null,
    endAt: typeof row.endAt === "string" ? row.endAt : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
  };
}

export function filterHostMeetings(
  meetings: readonly HostMeeting[],
  now = new Date(),
): HostMeeting[] {
  const nowMs = now.getTime();
  return [...meetings]
    .filter((meeting) => {
      const status = (meeting.status ?? "").trim().toLowerCase();
      if (EXCLUDED.has(status)) return false;
      const start = parseInstant(meeting.startAt);
      const end = parseInstant(meeting.endAt);
      // Unscheduled (all-day) instant meetings stay visible.
      if (!start && !end) return true;
      // Open-ended (started, not closed).
      if (start && !end) return true;
      if (!end) return status === "backlog";
      return end.getTime() + POST_END_MS > nowMs;
    })
    .sort((a, b) => {
      const aStart = parseInstant(a.startAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bStart = parseInstant(b.startAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aStart !== bStart) return aStart - bStart;
      return a.number - b.number;
    });
}

export function formatHostMeetingWhen(
  startAt: string | null,
  endAt: string | null,
  now = new Date(),
): string {
  const start = parseInstant(startAt);
  const end = parseInstant(endAt);
  if (!start && !end) return "All day · not started";
  if (!start) return "";
  const nowMs = now.getTime();
  if (!end) {
    return start.getTime() <= nowMs ? "In progress · open-ended" : "Scheduled";
  }
  if (start.getTime() <= nowMs && nowMs < end.getTime()) {
    return "In progress";
  }
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateLabel} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

function fetchErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError && /NetworkError|Failed to fetch|Load failed/i.test(err.message)) {
    return "Could not reach the meetings API (is BacksterMeet Vite on 127.0.0.1:1430?).";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function fetchHostMeetings(): Promise<HostMeeting[]> {
  let response: Response;
  try {
    response = await fetch("/api/backsteros/meetings");
  } catch (err) {
    throw new Error(fetchErrorMessage(err, "Could not load meetings"));
  }
  const payload = (await response.json().catch(() => ({}))) as {
    meetings?: Array<Record<string, unknown>>;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Could not load meetings");
  }
  return (payload.meetings ?? [])
    .map(mapHostMeeting)
    .filter((row): row is HostMeeting => row != null);
}

function patchErrorMessage(payload: Record<string, unknown>): string {
  const error = payload.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Meeting update failed";
}

export async function patchHostMeeting(
  meetingId: string,
  patch: {
    startAt?: string | null;
    endAt?: string | null;
    status?: string;
    title?: string;
  },
): Promise<HostMeeting> {
  let response: Response;
  try {
    response = await fetch(
      `/api/backsteros/meetings/${encodeURIComponent(meetingId.trim())}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
  } catch (err) {
    throw new Error(fetchErrorMessage(err, "Could not update meeting"));
  }
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(patchErrorMessage(payload) || "Could not update meeting");
  }
  const meeting = mapHostMeeting(payload);
  if (!meeting) throw new Error("Meeting updated without a payload");
  return meeting;
}

/** Instant meeting: start now, open-ended until the host closes the room. */
export async function createQuickCallMeeting(
  title?: string,
): Promise<HostMeeting> {
  let response: Response;
  try {
    response = await fetch("/api/backsteros/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: (title?.trim() || "Quick call").slice(0, 500),
        startAt: new Date().toISOString(),
        endAt: null,
        format: "video_call",
        status: "in_progress",
      }),
    });
  } catch (err) {
    throw new Error(fetchErrorMessage(err, "Could not create quick call"));
  }
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(patchErrorMessage(payload) || "Could not create quick call");
  }
  const meeting = mapHostMeeting(payload);
  if (!meeting) throw new Error("Quick call created without a meeting payload");
  return meeting;
}

/**
 * When the room opens: stamp start (and in_progress) only if still unscheduled.
 * Instant quick calls already have startAt from create.
 */
export async function markHostMeetingRoomOpened(
  meeting: HostMeeting,
): Promise<HostMeeting> {
  if (meeting.startAt) return meeting;
  return patchHostMeeting(meeting.id, {
    startAt: new Date().toISOString(),
    status: "in_progress",
  });
}

/** When the room closes: stamp end if still open-ended. */
export async function markHostMeetingRoomClosed(
  meeting: HostMeeting,
): Promise<HostMeeting> {
  if (meeting.endAt || !meeting.startAt) return meeting;
  const start = parseInstant(meeting.startAt);
  let endMs = Date.now();
  // API rejects endAt <= startAt — bump by 1m if the room was open for <1s.
  if (start && endMs <= start.getTime()) {
    endMs = start.getTime() + 60_000;
  }
  return patchHostMeeting(meeting.id, {
    endAt: new Date(endMs).toISOString(),
  });
}
