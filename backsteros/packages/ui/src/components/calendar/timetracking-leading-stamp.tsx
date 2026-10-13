"use client";

import {
  formatTrackedTimeInput,
  parseTrackedTimeInput,
} from "@backsteros/contracts";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import {
  formatTimetrackingDuration,
  formatTimetrackingLeadingStamp,
  resolveTimetrackingGroupDateYmd,
} from "../../calendar/calendar-timetracking-entries.js";
import { TrackedTimeIcon } from "../icons/tracked-time-icon.js";

export type TimetrackingLeadingStampProps = {
  scheduleAt?: Date | number | string | null;
  trackedDurationSeconds: number;
  timeZone?: string;
  className?: string;
  /** Running timer — green live chrome + pulsing duration. */
  isLive?: boolean;
  /**
   * When set, clicking the duration opens an inline editor (same transparent
   * input chrome as TrackedTimeField). Live timers stay read-only.
   */
  onTrackedDurationSecondsChange?: (seconds: number | null) => void;
};

/**
 * Leading Timetracking chrome: schedule day · stopwatch · tracked duration.
 * Duration is click-to-edit when `onTrackedDurationSecondsChange` is provided —
 * edit mode uses a borderless input so it reads as in-place text, matching the
 * timer pill.
 */
export function TimetrackingLeadingStamp({
  scheduleAt,
  trackedDurationSeconds,
  timeZone,
  className,
  isLive = false,
  onTrackedDurationSecondsChange,
}: TimetrackingLeadingStampProps) {
  const canEdit = Boolean(onTrackedDurationSecondsChange) && !isLive;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() =>
    formatTrackedTimeInput(trackedDurationSeconds),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const ymd = resolveTimetrackingGroupDateYmd(scheduleAt, timeZone);
  const duration = formatTimetrackingDuration(trackedDurationSeconds);
  const title = isLive
    ? `${formatTimetrackingLeadingStamp(scheduleAt, trackedDurationSeconds, timeZone)} (live)`
    : canEdit
      ? `${formatTimetrackingLeadingStamp(scheduleAt, trackedDurationSeconds, timeZone)} — click to edit`
      : formatTimetrackingLeadingStamp(
          scheduleAt,
          trackedDurationSeconds,
          timeZone,
        );

  useEffect(() => {
    if (isEditing) return;
    setDraft(formatTrackedTimeInput(trackedDurationSeconds));
  }, [isEditing, trackedDurationSeconds]);

  useEffect(() => {
    if (!isEditing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isEditing]);

  function stopRowOpen(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  /** Keep list/row shortcuts from stealing keys; never block typing into the field. */
  function stopListShortcuts(event: KeyboardEvent) {
    event.stopPropagation();
  }

  function beginEdit(event: MouseEvent | KeyboardEvent) {
    if (!canEdit) return;
    stopRowOpen(event);
    setDraft(formatTrackedTimeInput(trackedDurationSeconds));
    setIsEditing(true);
  }

  function commit(raw: string) {
    if (!onTrackedDurationSecondsChange) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      onTrackedDurationSecondsChange(null);
      setDraft("");
      return;
    }
    const parsed = parseTrackedTimeInput(trimmed);
    if (parsed == null) {
      setDraft(formatTrackedTimeInput(trackedDurationSeconds));
      return;
    }
    onTrackedDurationSecondsChange(parsed);
    setDraft(formatTrackedTimeInput(parsed));
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    commit(event.currentTarget.value);
    setIsEditing(false);
  }

  const inputValue = draft.trim()
    ? draft
    : formatTrackedTimeInput(trackedDurationSeconds);

  return (
    <span
      className={[
        "task-item-row__due-ymd",
        "task-item-row__tracked-stamp",
        isLive ? "is-live" : null,
        canEdit ? "is-editable" : null,
        isEditing ? "is-editing" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={title}
      data-timetracking-live={isLive ? "true" : undefined}
    >
      {ymd ? (
        <span className="task-item-row__tracked-stamp-date">{ymd}</span>
      ) : null}
      <TrackedTimeIcon
        className="task-item-row__tracked-stamp-icon"
        size={12}
      />
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          className="task-item-row__tracked-stamp-input"
          placeholder="00:00:00"
          value={inputValue}
          size={8}
          aria-label="Tracked duration"
          onMouseDown={(event) => {
            // Focus the input without activating the parent row.
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            stopListShortcuts(event);
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event.currentTarget.value);
              setIsEditing(false);
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(formatTrackedTimeInput(trackedDurationSeconds));
              setIsEditing(false);
            }
          }}
        />
      ) : canEdit ? (
        <button
          type="button"
          className="task-item-row__tracked-stamp-duration-btn"
          aria-label="Edit tracked duration"
          onMouseDown={stopRowOpen}
          onClick={beginEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              beginEdit(event);
            }
          }}
        >
          <span className="task-item-row__tracked-stamp-duration">
            {duration}
          </span>
        </button>
      ) : (
        <span className="task-item-row__tracked-stamp-duration">{duration}</span>
      )}
    </span>
  );
}
