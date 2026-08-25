"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";

export type CalendarDateNavProps = {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  disabled?: boolean;
};

export function CalendarDateNav({
  onPrev,
  onNext,
  onToday,
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
    </div>
  );
}
