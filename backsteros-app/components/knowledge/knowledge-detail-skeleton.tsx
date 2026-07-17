"use client";

import { DOCUMENT_CONTENT_MAX_WIDTH } from "@/lib/documents/content-layout";

type KnowledgeDetailSkeletonProps = {
  framed?: boolean;
};

function KnowledgeSkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={["knowledge-detail-skeleton-block", className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

/**
 * Knowledge document loading state: icon + title + body lines —
 * matching the ready document-detail layout.
 */
export function KnowledgeDetailSkeleton({
  framed = true,
}: KnowledgeDetailSkeletonProps) {
  const body = (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-busy="true"
      aria-label="Loading knowledge document"
      data-content-detail
    >
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden py-4">
        <div
          className="mx-auto w-full px-4 pt-8 pb-8"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <div className="mb-6 flex flex-col items-start gap-3">
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-icon" />
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-title" />
          </div>

          <div className="flex flex-col gap-3">
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--wide" />
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-line" />
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--medium" />
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--short" />
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--wide" />
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--medium" />
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-line" />
            <KnowledgeSkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--short" />
          </div>
        </div>
      </div>
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

/** Side-panel document tree rows while knowledge docs are loading. */
export function KnowledgeSidePanelSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <ul
      className="m-0 flex list-none flex-col gap-0.5 p-0"
      aria-busy="true"
      aria-label="Loading knowledge documents"
    >
      {Array.from({ length: rows }, (_, index) => (
        <li
          key={index}
          className="knowledge-side-panel-skeleton-row"
          style={
            index === 1 || index === 4
              ? { paddingLeft: 22 }
              : index === 2 || index === 5
                ? { paddingLeft: 36 }
                : undefined
          }
        >
          <KnowledgeSkeletonBlock className="knowledge-side-panel-skeleton-icon" />
          <KnowledgeSkeletonBlock className="knowledge-side-panel-skeleton-title" />
        </li>
      ))}
    </ul>
  );
}
