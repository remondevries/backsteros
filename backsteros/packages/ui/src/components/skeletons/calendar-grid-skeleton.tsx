import { SkeletonBlock } from "./skeleton-block.js";

/** Calendar month grid + day column chrome. */
export function CalendarGridSkeleton() {
  return (
    <div className="calendar-grid-skeleton" aria-hidden="true">
      <div className="calendar-grid-skeleton__header">
        <SkeletonBlock className="calendar-grid-skeleton__nav" />
        <SkeletonBlock className="calendar-grid-skeleton__title" />
        <SkeletonBlock className="calendar-grid-skeleton__nav" />
      </div>
      <div className="calendar-grid-skeleton__weekdays">
        {Array.from({ length: 7 }, (_, index) => (
          <SkeletonBlock key={index} className="calendar-grid-skeleton__weekday" />
        ))}
      </div>
      <div className="calendar-grid-skeleton__grid">
        {Array.from({ length: 35 }, (_, index) => (
          <SkeletonBlock
            key={index}
            className="calendar-grid-skeleton__cell"
          />
        ))}
      </div>
    </div>
  );
}
