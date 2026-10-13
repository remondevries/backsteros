import { SkeletonBlock } from "./skeleton-block.js";

/** Main-pane placeholder while navigating to inbox list (no selected item). */
export function InboxListSkeleton() {
  return (
    <div className="inbox-list-skeleton" aria-hidden="true">
      <div className="inbox-list-skeleton__empty">
        <SkeletonBlock className="inbox-list-skeleton__icon" />
        <SkeletonBlock className="inbox-list-skeleton__line inbox-list-skeleton__line--title" />
        <SkeletonBlock className="inbox-list-skeleton__line inbox-list-skeleton__line--meta" />
      </div>
    </div>
  );
}
