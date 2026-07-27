import { SkeletonBlock } from "./skeleton-block.js";

/** Side-panel list rows while inbox items are loading. */
export function InboxSidePanelSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul
      className="side-panel-skeleton-list"
      aria-busy="true"
      aria-label="Loading inbox items"
    >
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="inbox-side-panel-skeleton-row">
          <SkeletonBlock className="inbox-side-panel-skeleton-icon" />
          <div className="side-panel-skeleton-list__lines">
            <SkeletonBlock className="inbox-side-panel-skeleton-title" />
            <SkeletonBlock className="inbox-side-panel-skeleton-meta" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export {
  TaskDetailSkeleton as InboxDetailSkeleton,
} from "./task-detail-skeleton.js";
