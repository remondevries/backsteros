import { DOCUMENT_CONTENT_MAX_WIDTH } from "../../document-editor-theme.js";
import { SkeletonBlock } from "./skeleton-block.js";

export type TaskDetailSkeletonProps = {
  /** When false, omit the outer content-detail shell (parent already provides it). */
  framed?: boolean;
};

/**
 * Task loading state for the main column (title + description).
 * The properties side panel renders for real and fills in when data arrives.
 */
export function TaskDetailSkeleton({ framed = true }: TaskDetailSkeletonProps) {
  const body = (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-busy="true"
      aria-label="Loading task"
    >
      <div
        className="mx-auto mb-6 w-full shrink-0 box-border px-4 pt-8"
        style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
      >
        <SkeletonBlock className="task-detail-skeleton-id" />
        <SkeletonBlock className="task-detail-skeleton-title" />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="mx-auto w-full px-4 pb-8"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <div className="flex flex-col gap-3">
            <SkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--wide" />
            <SkeletonBlock className="task-detail-skeleton-line" />
            <SkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--medium" />
            <SkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--short" />
            <SkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--wide" />
            <SkeletonBlock className="task-detail-skeleton-line task-detail-skeleton-line--medium" />
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
