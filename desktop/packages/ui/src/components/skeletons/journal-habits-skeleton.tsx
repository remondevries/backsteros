import { SkeletonBlock } from "./skeleton-block.js";

/** Journal habits tracker grid. */
export function JournalHabitsSkeleton() {
  return (
    <div className="journal-habits-skeleton" aria-hidden="true">
      <SkeletonBlock className="journal-habits-skeleton__title" />
      <div className="journal-habits-skeleton__grid">
        {Array.from({ length: 12 }, (_, index) => (
          <SkeletonBlock key={index} className="journal-habits-skeleton__cell" />
        ))}
      </div>
    </div>
  );
}
