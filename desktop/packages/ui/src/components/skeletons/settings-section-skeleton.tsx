import { SkeletonBlock } from "./skeleton-block.js";

/** Settings detail column while a tab loads. */
export function SettingsSectionSkeleton() {
  return (
    <div className="settings-section-skeleton" aria-hidden="true">
      <SkeletonBlock className="settings-section-skeleton__title" />
      <div className="settings-section-skeleton__blocks">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock
            key={index}
            className="settings-section-skeleton__block"
          />
        ))}
      </div>
    </div>
  );
}
