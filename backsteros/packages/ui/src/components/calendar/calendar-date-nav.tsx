"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SyncIcon,
} from "@primer/octicons-react";

export type CalendarDateNavProps = {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Optional manual refresh (Google Calendar + meetings), right of Next. */
  onRefresh?: () => void;
  refreshing?: boolean;
  disabled?: boolean;
};

export function CalendarDateNav({
  onPrev,
  onNext,
  onToday,
  onRefresh,
  refreshing = false,
  disabled = false,
}: CalendarDateNavProps) {
  return (
    <div className="calendar-date-nav" role="group" aria-label="Calendar navigation">
      <button
        type="button"
        className="calendar-date-nav__btn calendar-date-nav__btn--arrow"
        aria-label="Previous period"
        disabled={disabled}
        onClick={onPrev}
      >
        <ChevronLeftIcon size={14} />
      </button>
      <button
        type="button"
        className="calendar-date-nav__btn calendar-date-nav__btn--today"
        disabled={disabled}
        onClick={onToday}
      >
        Today
      </button>
      <button
        type="button"
        className="calendar-date-nav__btn calendar-date-nav__btn--arrow"
        aria-label="Next period"
        disabled={disabled}
        onClick={onNext}
      >
        <ChevronRightIcon size={14} />
      </button>
      {onRefresh ? (
        <button
          type="button"
          className="calendar-date-nav__btn calendar-date-nav__btn--refresh"
          aria-label="Refresh calendar"
          title="Refresh calendar"
          disabled={disabled || refreshing}
          onClick={onRefresh}
        >
          <SyncIcon
            size={14}
            className={
              refreshing
                ? "calendar-date-nav__sync-icon is-spinning"
                : "calendar-date-nav__sync-icon"
            }
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}
