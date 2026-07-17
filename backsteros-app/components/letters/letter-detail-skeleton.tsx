"use client";

import { DOCUMENT_CONTENT_MAX_WIDTH } from "@/lib/documents/content-layout";

type LetterDetailSkeletonProps = {
  framed?: boolean;
};

function LetterSkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={["letter-detail-skeleton-block", className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

/**
 * Letter loading state: notes (icon + title + body), bottom PDF strip, and
 * properties panel — matching the ready letter-detail layout.
 */
export function LetterDetailSkeleton({
  framed = true,
}: LetterDetailSkeletonProps) {
  const body = (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row"
      aria-busy="true"
      aria-label="Loading letter"
      data-content-detail
      data-detail-split=""
    >
      <div className="document-pdf-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden py-4">
          <div
            className="mx-auto w-full px-4 pt-8 pb-8"
            style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
          >
            <div className="mb-6 flex flex-col items-start gap-3">
              <LetterSkeletonBlock className="letter-detail-skeleton-icon" />
              <LetterSkeletonBlock className="letter-detail-skeleton-title" />
            </div>

            <div className="flex flex-col gap-3">
              <LetterSkeletonBlock className="letter-detail-skeleton-line letter-detail-skeleton-line--wide" />
              <LetterSkeletonBlock className="letter-detail-skeleton-line" />
              <LetterSkeletonBlock className="letter-detail-skeleton-line letter-detail-skeleton-line--medium" />
              <LetterSkeletonBlock className="letter-detail-skeleton-line letter-detail-skeleton-line--short" />
              <LetterSkeletonBlock className="letter-detail-skeleton-line letter-detail-skeleton-line--wide" />
            </div>
          </div>
        </div>

        <div className="letter-detail-skeleton-pdf-bottom shrink-0 border-t border-white/10">
          <LetterSkeletonBlock className="letter-detail-skeleton-pdf-surface letter-detail-skeleton-pdf-surface--bottom" />
        </div>
      </div>

      <aside className="letter-detail-skeleton-properties hidden min-h-0 w-[300px] shrink-0 flex-col pt-4 lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
          <div className="flex flex-col gap-2">
            <section className="letter-detail-skeleton-section">
              <LetterSkeletonBlock className="letter-detail-skeleton-section-label" />
              <div className="flex flex-col gap-2 px-1.5">
                <LetterSkeletonBlock className="letter-detail-skeleton-property" />
                <LetterSkeletonBlock className="letter-detail-skeleton-property" />
              </div>
            </section>
            <section className="letter-detail-skeleton-section">
              <LetterSkeletonBlock className="letter-detail-skeleton-section-label" />
              <div className="flex flex-col gap-2 px-1.5">
                <LetterSkeletonBlock className="letter-detail-skeleton-property" />
                <LetterSkeletonBlock className="letter-detail-skeleton-property" />
                <LetterSkeletonBlock className="letter-detail-skeleton-property" />
                <LetterSkeletonBlock className="letter-detail-skeleton-property letter-detail-skeleton-property--tall" />
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );

  if (!framed) {
    return body;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {body}
    </div>
  );
}

/** Side-panel letter list rows while letters are loading. */
export function LettersSidePanelSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul
      className="m-0 flex list-none flex-col gap-1 p-0"
      aria-busy="true"
      aria-label="Loading letters"
    >
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="letter-side-panel-skeleton-row">
          <LetterSkeletonBlock className="letter-side-panel-skeleton-icon" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <LetterSkeletonBlock className="letter-side-panel-skeleton-title" />
            <LetterSkeletonBlock className="letter-side-panel-skeleton-meta" />
          </div>
        </li>
      ))}
    </ul>
  );
}
