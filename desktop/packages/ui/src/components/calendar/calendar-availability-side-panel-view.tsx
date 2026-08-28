"use client";

import { useMemo, useRef } from "react";
import { PlusIcon, XIcon } from "@primer/octicons-react";

import type {
  MeetingWeekdayHoursEntry,
  MeetingWeekdayHoursSlot,
} from "@backsteros/contracts";

import { weekdayLabel } from "../../calendar/calendar-availability-events.js";
import { type CalendarPageMode } from "../../calendar/calendar-page-mode.js";
import {
  addWeekdaySlot,
  patchWeekdayHoursEntry,
  removeWeekdaySlot,
  suggestNextSlot,
  updateWeekdaySlot,
} from "../../calendar/calendar-availability-slots.js";
import { openNativeDatePicker } from "../../dropdowns/native-date-picker.js";
import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import { CalendarSidePanelModeFooter } from "./calendar-side-panel-mode-footer.js";

export type CalendarAvailabilitySidePanelViewProps = {
  weekdayHours: MeetingWeekdayHoursEntry[];
  loading?: boolean;
  pageMode: CalendarPageMode;
  onPageModeChange: (mode: CalendarPageMode) => void;
  onWeekdayHoursChange: (weekdayHours: MeetingWeekdayHoursEntry[]) => void;
  /** When true, render only the day list — parent shell owns chrome + mode footer. */
  embedded?: boolean;
};

function AvailabilityDayToggle({
  checked,
  disabled,
  onChange,
  dayLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  dayLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${dayLabel}`}
      className={`calendar-availability-day-toggle${checked ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="calendar-availability-day-toggle__switch" aria-hidden="true">
        <span className="calendar-availability-day-toggle__thumb" />
      </span>
      <span className="calendar-availability-day-toggle__label">{dayLabel}</span>
    </button>
  );
}

function AvailabilityTimePill({
  value,
  disabled,
  onChange,
  label,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className="calendar-availability-time-pill"
      onClick={(event) => {
        if (disabled) return;
        if (event.target === inputRef.current) return;
        openNativeDatePicker(inputRef.current);
      }}
    >
      <span className="calendar-availability-time-pill__label">{label}</span>
      <input
        ref={inputRef}
        type="time"
        className="calendar-availability-time-pill__input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AvailabilitySlotRow({
  slot,
  slotIndex,
  weekday,
  loading,
  enabled,
  onChange,
  onRemove,
}: {
  slot: MeetingWeekdayHoursSlot;
  slotIndex: number;
  weekday: number;
  loading?: boolean;
  enabled: boolean;
  onChange: (slotIndex: number, patch: Partial<MeetingWeekdayHoursSlot>) => void;
  onRemove: (slotIndex: number) => void;
}) {
  const day = weekdayLabel(weekday);
  return (
    <div className="calendar-availability-slot-row">
      <AvailabilityTimePill
        value={slot.start}
        disabled={loading || !enabled}
        label={`${day} slot ${slotIndex + 1} start`}
        onChange={(start) => onChange(slotIndex, { start })}
      />
      <span className="calendar-availability-slot-row__dash">–</span>
      <AvailabilityTimePill
        value={slot.end}
        disabled={loading || !enabled}
        label={`${day} slot ${slotIndex + 1} end`}
        onChange={(end) => onChange(slotIndex, { end })}
      />
      <button
        type="button"
        className="calendar-availability-slot-row__remove"
        aria-label={`Remove ${day} slot ${slotIndex + 1}`}
        title="Remove time slot"
        disabled={loading || !enabled}
        onClick={() => onRemove(slotIndex)}
      >
        <XIcon size={12} />
      </button>
    </div>
  );
}

export function CalendarAvailabilitySidePanelView({
  weekdayHours,
  loading = false,
  pageMode,
  onPageModeChange,
  onWeekdayHoursChange,
  embedded = false,
}: CalendarAvailabilitySidePanelViewProps) {
  const sorted = useMemo(
    () => [...weekdayHours].sort((a, b) => a.weekday - b.weekday),
    [weekdayHours],
  );

  const dayList = (
    <div className="calendar-availability-side-panel-list">
      {sorted.map((entry) => (
        <div
          key={entry.weekday}
          className={`calendar-availability-day-row${entry.enabled ? "" : " is-off"}`}
          data-weekday={entry.weekday}
        >
          <div className="calendar-availability-day-row__header">
            <AvailabilityDayToggle
              checked={entry.enabled}
              disabled={loading}
              dayLabel={weekdayLabel(entry.weekday)}
              onChange={(enabled) =>
                onWeekdayHoursChange(
                  patchWeekdayHoursEntry(weekdayHours, entry.weekday, {
                    enabled,
                    slots: enabled
                      ? entry.slots.length > 0
                        ? entry.slots
                        : [suggestNextSlot([])]
                      : entry.slots,
                  }),
                )
              }
            />

            <div className="calendar-availability-day-row__actions">
              <button
                type="button"
                className="calendar-availability-day-row__icon-btn"
                aria-label={`Add time slot on ${weekdayLabel(entry.weekday)}`}
                disabled={loading || !entry.enabled}
                onClick={() =>
                  onWeekdayHoursChange(addWeekdaySlot(weekdayHours, entry.weekday))
                }
              >
                <PlusIcon size={14} />
              </button>
            </div>
          </div>

          <div className="calendar-availability-day-row__body">
            {entry.enabled ? (
              entry.slots.map((slot, slotIndex) => (
                <AvailabilitySlotRow
                  key={`${entry.weekday}-${slotIndex}`}
                  slot={slot}
                  slotIndex={slotIndex}
                  weekday={entry.weekday}
                  loading={loading}
                  enabled={entry.enabled}
                  onChange={(index, patch) =>
                    onWeekdayHoursChange(
                      updateWeekdaySlot(weekdayHours, entry.weekday, index, patch),
                    )
                  }
                  onRemove={(index) =>
                    onWeekdayHoursChange(
                      removeWeekdaySlot(weekdayHours, entry.weekday, index),
                    )
                  }
                />
              ))
            ) : (
              <span className="calendar-availability-day-row__unavailable">
                Unavailable
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  if (embedded) {
    return dayList;
  }

  return (
    <div className="app-content-side-panel calendar-side-panel calendar-availability-side-panel">
      <ContentSidePanelHeader title="Availability" />
      <div className="app-content-side-panel-main">{dayList}</div>
      <CalendarSidePanelModeFooter
        pageMode={pageMode}
        onPageModeChange={onPageModeChange}
      />
    </div>
  );
}
