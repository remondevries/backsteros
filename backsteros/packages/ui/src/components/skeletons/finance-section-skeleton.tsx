import { SkeletonBlock } from "./skeleton-block.js";

/** Finance main column — dashboard cards + table rows. */
export function FinanceSectionSkeleton() {
  return (
    <div className="finance-section-skeleton" aria-hidden="true">
      <div className="finance-section-skeleton__cards">
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonBlock key={index} className="finance-section-skeleton__card" />
        ))}
      </div>
      <div className="finance-section-skeleton__table">
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonBlock
            key={index}
            className="finance-section-skeleton__row"
          />
        ))}
      </div>
    </div>
  );
}
