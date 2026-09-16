"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { formatCalendarTaskScheduleLabel } from "../../calendar/calendar-events.js";
import { openNativeDatePicker } from "../../dropdowns/native-date-picker.js";
import {
  applyMeetingEndTime,
  applyMeetingScheduleDate,
  applyMeetingStartTime,
  formatLocalHm,
} from "../../meetings/meeting-schedule-datetime.js";
import {
  buildMeetingScheduleDropdownOptions,
  isClearMeetingScheduleValue,
  isPickMeetingScheduleValue,
  meetingScheduleDropdownValue,
  meetingScheduleRangeFromDropdownValue,
} from "../../meetings/meeting-schedule-dropdown-options.js";
import {
  naturalLanguageMeetingSchedulePreview,
  parseNaturalLanguageMeetingSchedule,
} from "../../meetings/parse-natural-language-meeting-schedule.js";
import { formatDueDateInputValue } from "../../tasks/task-due-date.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import {
  PropertyDropdown,
  type PropertyDropdownTriggerVariant,
} from "../dropdowns/property-dropdown.js";
import { DueDateCalendar } from "../tasks/due-date-calendar.js";
import { TaskDueDateIcon } from "../tasks/task-due-date-icon.js";

const PANEL_WIDTH = 300;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

export type MeetingScheduleDropdownProps = {
  startAt: Date | null;
  endAt: Date | null;
  disabled?: boolean;
  onStartChange?: (value: Date | null) => void;
  onEndChange?: (value: Date | null) => void;
  triggerVariant?: PropertyDropdownTriggerVariant;
  /** Open the searchable schedule menu on mount (Shift+D deferred opens). */
  defaultOpen?: boolean;
  /** Placement for the initial `defaultOpen`. */
  defaultOpenPlacement?: "anchored" | "center";
};

type MeetingSchedulePanelProps = {
  open: boolean;
  onClose: () => void;
  startAt: Date | null;
  endAt: Date | null;
  onStartChange?: (value: Date | null) => void;
  onEndChange?: (value: Date | null) => void;
  anchorRef: RefObject<HTMLElement | null>;
  align?: "start" | "end";
};

function MeetingTimeInput({
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className="meeting-schedule-time-pill"
      onClick={(event) => {
        if (disabled) return;
        if (event.target === inputRef.current) return;
        openNativeDatePicker(inputRef.current);
      }}
    >
      <input
        ref={inputRef}
        type="time"
        className="meeting-schedule-time-pill__input"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function MeetingSchedulePanel({
  open,
  onClose,
  startAt,
  endAt,
  onStartChange,
  onEndChange,
  anchorRef,
  align = "start",
}: MeetingSchedulePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  const canEdit = Boolean(onStartChange || onEndChange);
  const selectedYmd = formatDueDateInputValue(startAt) || null;

  const commitRange = useCallback(
    (next: { startAt: Date; endAt: Date } | null) => {
      if (!next) return;
      onStartChange?.(next.startAt);
      onEndChange?.(next.endAt);
    },
    [onEndChange, onStartChange],
  );

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const trigger =
      anchor.querySelector("button") ??
      (anchor instanceof HTMLButtonElement ? anchor : null) ??
      anchor;
    const rect = trigger.getBoundingClientRect();
    const width = PANEL_WIDTH;
    const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

    const panelHeight = panelRef.current?.offsetHeight ?? 360;
    const spaceBelow =
      window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;

    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      visibility: "visible",
    });
  }, [align, anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [open, startAt, endAt, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    }

    function handleReposition() {
      updatePosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    // Capture so Escape closes the schedule panel before the meeting overlay.
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [anchorRef, onClose, open, updatePosition]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="searchable-dropdown-panel meeting-schedule-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="false"
      aria-label="Meeting schedule"
      data-meeting-schedule-panel=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      <DueDateCalendar
        value={selectedYmd}
        disabled={!canEdit}
        showTodayButton={false}
        onSelect={(ymd) => {
          commitRange(applyMeetingScheduleDate(startAt, endAt, ymd));
        }}
      />
      <div className="meeting-schedule-panel__times">
        <PropertyFieldGroup label="Starts">
          <MeetingTimeInput
            value={formatLocalHm(startAt)}
            disabled={!onStartChange}
            ariaLabel="Meeting start time"
            onChange={(hm) => {
              commitRange(applyMeetingStartTime(startAt, endAt, hm));
            }}
          />
        </PropertyFieldGroup>
        <PropertyFieldGroup label="Ends">
          <MeetingTimeInput
            value={formatLocalHm(endAt)}
            disabled={!onEndChange}
            ariaLabel="Meeting end time"
            onChange={(hm) => {
              commitRange(applyMeetingEndTime(startAt, endAt, hm));
            }}
          />
        </PropertyFieldGroup>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Meeting schedule chip: Shift+D / click opens searchable NL presets;
 * “Pick times…” opens the calendar + start/end time panel.
 */
export function MeetingScheduleDropdown({
  startAt,
  endAt,
  disabled = false,
  onStartChange,
  onEndChange,
  triggerVariant = "inlineChip",
  defaultOpen = false,
  defaultOpenPlacement,
}: MeetingScheduleDropdownProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isDisabled = disabled || (!onStartChange && !onEndChange);
  const hasSchedule = Boolean(startAt && !Number.isNaN(startAt.getTime()));
  const label =
    formatCalendarTaskScheduleLabel(startAt, endAt) ?? "Set schedule";

  const options = useMemo(
    () => buildMeetingScheduleDropdownOptions(startAt, endAt),
    [endAt, startAt],
  );
  const selectedValue = meetingScheduleDropdownValue(
    startAt,
    endAt,
    options,
  );

  const applyRange = useCallback(
    (next: { startAt: Date; endAt: Date } | null) => {
      if (isDisabled) return;
      if (!next) {
        onStartChange?.(null);
        onEndChange?.(null);
        return;
      }
      onStartChange?.(next.startAt);
      onEndChange?.(next.endAt);
    },
    [isDisabled, onEndChange, onStartChange],
  );

  const handleChange = useCallback(
    (value: string) => {
      if (isDisabled) return;
      if (isPickMeetingScheduleValue(value)) {
        setCalendarOpen(true);
        return;
      }
      if (isClearMeetingScheduleValue(value)) {
        applyRange(null);
        return;
      }
      applyRange(meetingScheduleRangeFromDropdownValue(value));
    },
    [applyRange, isDisabled],
  );

  const handleQuerySubmit = useCallback(
    (query: string) => {
      const result = parseNaturalLanguageMeetingSchedule(query);
      if (result.kind === "clear") {
        applyRange(null);
        return true;
      }
      if (result.kind === "range") {
        applyRange({ startAt: result.startAt, endAt: result.endAt });
        return true;
      }
      return false;
    },
    [applyRange],
  );

  const handleQueryPreview = useCallback(
    (query: string) => naturalLanguageMeetingSchedulePreview(query),
    [],
  );

  return (
    <div ref={anchorRef} className="meeting-schedule-dropdown">
      <PropertyDropdown
        value={selectedValue}
        options={options}
        onChange={handleChange}
        disabled={isDisabled}
        searchPlaceholder="Tomorrow at 4:22pm till 4:55pm…"
        searchShortcutLabel="⇧D"
        ariaLabel={`Meeting schedule: ${label}`}
        taskPropertyDropdownId="dueDate"
        fallbackIcon={<TaskDueDateIcon active={hasSchedule} size={14} />}
        fallbackLabel={label}
        selectedDisplayLabel={label}
        mutedFallback={!hasSchedule}
        triggerVariant={triggerVariant}
        panelAlign="start"
        panelWidth={300}
        defaultOpen={defaultOpen}
        defaultOpenPlacement={defaultOpenPlacement}
        onQuerySubmit={handleQuerySubmit}
        queryPreviewLabel={handleQueryPreview}
      />
      <MeetingSchedulePanel
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        startAt={startAt}
        endAt={endAt}
        onStartChange={onStartChange}
        onEndChange={onEndChange}
        anchorRef={anchorRef}
      />
    </div>
  );
}
