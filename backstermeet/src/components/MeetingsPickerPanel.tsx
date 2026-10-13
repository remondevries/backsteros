import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, Plus, X } from "@mynaui/icons-react";
import { MeetingCalendarStatusIcon } from "@backsteros/ui/meeting-calendar-status-icon";

import {
  createQuickCallMeeting,
  fetchHostMeetings,
  filterHostMeetings,
  formatHostMeetingWhen,
  guestMeetUrl,
  type HostMeeting,
} from "../lib/host-meetings";

type MeetingsPickerPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeMeetingId: string | null;
  onSelectMeeting: (meeting: HostMeeting) => void;
};

export function MeetingsPickerTrigger({
  open,
  onOpenChange,
  startAt = null,
  endAt = null,
  status = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startAt?: string | null;
  endAt?: string | null;
  status?: string | null;
}) {
  return (
    <button
      type="button"
      className={["director__meetings-trigger", open ? "is-open" : null]
        .filter(Boolean)
        .join(" ")}
      aria-expanded={open}
      aria-controls="director-meetings-panel"
      title={open ? "Hide meetings" : "Show meetings"}
      onClick={() => onOpenChange(!open)}
    >
      <MeetingCalendarStatusIcon
        startAt={startAt}
        endAt={endAt}
        status={status}
        size={16}
        className="director__meetings-trigger-icon"
      />
      <span className="sr-only">
        {open ? "Hide meetings" : "Show meetings"}
      </span>
    </button>
  );
}

export function MeetingsPickerPanel({
  open,
  onOpenChange,
  activeMeetingId,
  onSelectMeeting,
}: MeetingsPickerPanelProps) {
  const [meetings, setMeetings] = useState<HostMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [quickTitle, setQuickTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchHostMeetings();
      setMeetings(filterHostMeetings(rows, new Date()));
    } catch (err) {
      setMeetings([]);
      setError(err instanceof Error ? err.message : "Could not load meetings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const poll = window.setInterval(() => void load(), 30_000);
    const tick = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [open, load]);

  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 1_500);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  async function onCreateQuickCall(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const meeting = await createQuickCallMeeting(quickTitle);
      setQuickTitle("");
      setMeetings((current) =>
        filterHostMeetings([meeting, ...current], new Date()),
      );
      onSelectMeeting(meeting);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create quick call");
    } finally {
      setCreating(false);
    }
  }

  async function onCopyJoinUrl(meeting: HostMeeting) {
    const url = guestMeetUrl(meeting.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(meeting.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not copy invite link",
      );
    }
  }

  if (!open) return null;

  const now = new Date(nowMs);

  return (
    <aside
      id="director-meetings-panel"
      className="director__meetings-panel"
      aria-label="Calendar meetings"
    >
      <header className="director__meetings-panel-header">
        <div>
          <p className="director__meetings-panel-eyebrow">Calendar</p>
          <h2 className="director__meetings-panel-title">Meetings</h2>
        </div>
        <button
          type="button"
          className="director__meetings-panel-close"
          title="Close"
          aria-label="Close meetings"
          onClick={() => onOpenChange(false)}
        >
          <X aria-hidden />
        </button>
      </header>

      <form
        className="director__meetings-quick"
        onSubmit={(event) => void onCreateQuickCall(event)}
      >
        <label className="director__meetings-quick-label" htmlFor="quick-call-title">
          Quick call
        </label>
        <div className="director__meetings-quick-row">
          <input
            id="quick-call-title"
            className="director__meetings-quick-input"
            type="text"
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder="Quick call"
            maxLength={500}
            disabled={creating}
          />
          <button
            type="submit"
            className="director__meetings-quick-submit"
            disabled={creating}
            title="Create an instant meeting that starts now"
          >
            <Plus aria-hidden />
            <span>{creating ? "…" : "Start"}</span>
          </button>
        </div>
        <p className="director__meetings-quick-hint">
          Starts now · open-ended until you close the room
        </p>
      </form>

      <div className="director__meetings-panel-body">
        {loading && meetings.length === 0 ? (
          <p className="director__meetings-panel-status">Loading…</p>
        ) : null}
        {error ? (
          <div className="director__meetings-panel-status is-error">
            <p>{error}</p>
            <button type="button" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : null}
        {!loading && !error && meetings.length === 0 ? (
          <p className="director__meetings-panel-status">
            No upcoming meetings
          </p>
        ) : null}

        <ul className="director__meetings-list">
          {meetings.map((meeting) => {
            const active = meeting.id === activeMeetingId;
            const when = formatHostMeetingWhen(
              meeting.startAt,
              meeting.endAt,
              now,
            );
            const joinUrl = guestMeetUrl(meeting.id);
            const copied = copiedId === meeting.id;
            return (
              <li
                key={meeting.id}
                className={[
                  "director__meetings-row",
                  active ? "is-active" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  type="button"
                  className="director__meetings-item"
                  onClick={() => onSelectMeeting(meeting)}
                >
                  <span className="director__meetings-item-main">
                    <MeetingCalendarStatusIcon
                      startAt={meeting.startAt}
                      endAt={meeting.endAt}
                      status={meeting.status}
                      now={now}
                      size={14}
                      className="director__meetings-item-icon"
                    />
                    <span className="director__meetings-item-text">
                      <span className="director__meetings-item-title">
                        {meeting.title}
                      </span>
                      {when ? (
                        <span className="director__meetings-item-when">
                          {when}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={[
                    "director__meetings-copy",
                    copied ? "is-copied" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={copied ? "Copied" : `Copy ${joinUrl}`}
                  aria-label={
                    copied
                      ? "Invite link copied"
                      : `Copy invite link for ${meeting.title}`
                  }
                  onClick={() => void onCopyJoinUrl(meeting)}
                >
                  <Copy aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
