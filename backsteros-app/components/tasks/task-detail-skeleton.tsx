"use client";

import { DOCUMENT_CONTENT_MAX_WIDTH } from "@/lib/documents/content-layout";

type TaskDetailSkeletonProps = {
  /** When false, omit the outer content-detail shell (parent already provides it). */
  framed?: boolean;
};

function TaskSkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={["task-detail-skeleton-block", className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

/**
 * Task loading state for the main column (title + description).
 * The properties side panel renders for real and fills in when data arrives.
 */
export function TaskDetailSkeleton({ framed = true }: TaskDetailSkeletonProps) {
  const body = (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-busy="true"
      aria-label="Loading task"
    >
      <div
        className="mx-auto w-full shrink-0 box-border px-4 pt-8 mb-6"
        style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
      >
        <TaskSkeletonBlock className="task-detail-skeleton-id" />
        <TaskSkeletonBlock className="task-detail-skeleton-title" />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="mx-auto w-full px-4 pb-8"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <div className="flex flex-col gap-3">
            <TaskSkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--wide" />
            <TaskSkeletonBlock className="task-detail-skeleton-line" />
            <TaskSkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--medium" />
            <TaskSkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--short" />
            <TaskSkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--wide" />
            <TaskSkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--medium" />
          </div>
        </div>
      </div>
    </div>
  );

  if (!framed) {
    return body;
  }

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
      data-content-detail
    >
      {body}
    </div>
  );
}
