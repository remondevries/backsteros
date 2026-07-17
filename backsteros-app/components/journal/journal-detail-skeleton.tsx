"use client";

import { JournalWhoopHeaderSkeleton } from "@/components/whoop/journal-whoop-header";
import { TasksNavIcon } from "@/components/shell/sidebar-nav-icons";
import { DOCUMENT_CONTENT_MAX_WIDTH } from "@/lib/documents/content-layout";

type JournalDetailSkeletonProps = {
  /** When false, omit the outer content-detail shell (parent already provides it). */
  framed?: boolean;
};

function JournalSkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={["journal-detail-skeleton-block", className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

/**
 * Full-page journal loading state: Whoop rings, icon + title, body lines, and
 * due-task rows — matching the ready layout so content does not jump.
 */
export function JournalDetailSkeleton({
  framed = true,
}: JournalDetailSkeletonProps) {
  const body = (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-busy="true"
      aria-label="Loading journal entry"
    >
      <div
        className="mx-auto w-full shrink-0 px-4 pt-8"
        style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
      >
        <div className="mb-2 min-h-[4.75rem] w-full">
          <JournalWhoopHeaderSkeleton />
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden py-4">
        <div
          className="mx-auto w-full px-4 pt-8 pb-8"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <div className="mb-6 flex flex-col items-start gap-3">
            <JournalSkeletonBlock className="journal-detail-skeleton-icon" />
            <JournalSkeletonBlock className="journal-detail-skeleton-title" />
          </div>

          <div className="flex flex-col gap-3">
            <JournalSkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--wide" />
            <JournalSkeletonBlock className="journal-detail-skeleton-line" />
            <JournalSkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--medium" />
            <JournalSkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--short" />
            <JournalSkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--wide" />
            <JournalSkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--medium" />
          </div>
        </div>

        <section
          className="mx-auto w-full px-4 pt-5 pb-10"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <p className="mb-0 ml-[8.5px] inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/45">
            <span className="inline-flex text-foreground/75" aria-hidden="true">
              <TasksNavIcon className="size-3.5" />
            </span>
            <span>Tasks</span>
          </p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="journal-detail-skeleton-task">
                <JournalSkeletonBlock className="journal-detail-skeleton-task-status" />
                <JournalSkeletonBlock className="journal-detail-skeleton-task-title" />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );

  if (!framed) {
    return body;
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-content-detail
    >
      {body}
    </div>
  );
}
