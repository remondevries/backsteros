"use client";

export {
  TaskDetailSkeleton as InboxDetailSkeleton,
} from "@/components/tasks/task-detail-skeleton";

function InboxSkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={["task-detail-skeleton-block", className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

/** Side-panel list rows while inbox items are loading. */
export function InboxSidePanelSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul
      className="m-0 flex list-none flex-col gap-1 p-0"
      aria-busy="true"
      aria-label="Loading inbox items"
    >
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="inbox-side-panel-skeleton-row">
          <InboxSkeletonBlock className="inbox-side-panel-skeleton-icon" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <InboxSkeletonBlock className="inbox-side-panel-skeleton-title" />
            <InboxSkeletonBlock className="inbox-side-panel-skeleton-meta" />
          </div>
        </li>
      ))}
    </ul>
  );
}
