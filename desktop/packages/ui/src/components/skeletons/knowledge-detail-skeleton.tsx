import { DOCUMENT_CONTENT_MAX_WIDTH } from "../../document-editor-theme.js";
import { SkeletonBlock } from "./skeleton-block.js";

export type KnowledgeDetailSkeletonProps = {
  framed?: boolean;
};

/**
 * Knowledge / document loading state: icon + title + body lines —
 * matching the ready document-detail layout.
 */
export function KnowledgeDetailSkeleton({
  framed = true,
}: KnowledgeDetailSkeletonProps) {
  const body = (
    <div
      className="detail-skeleton detail-skeleton--fill"
      aria-busy="true"
      aria-label="Loading knowledge document"
      data-content-detail
    >
      <div className="detail-skeleton__scroll">
        <div
          className="detail-skeleton__column detail-skeleton__column--padded"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <div className="detail-skeleton__title-stack">
            <SkeletonBlock className="knowledge-detail-skeleton-icon" />
            <SkeletonBlock className="knowledge-detail-skeleton-title" />
          </div>

          <div className="detail-skeleton__lines">
            <SkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--wide" />
            <SkeletonBlock className="knowledge-detail-skeleton-line" />
            <SkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--medium" />
            <SkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--short" />
            <SkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--wide" />
            <SkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--medium" />
            <SkeletonBlock className="knowledge-detail-skeleton-line" />
            <SkeletonBlock className="knowledge-detail-skeleton-line knowledge-detail-skeleton-line--short" />
          </div>
        </div>
      </div>
    </div>
  );

  if (!framed) {
    return body;
  }

  return <div className="detail-skeleton-frame">{body}</div>;
}

/** Side-panel document tree rows while knowledge docs are loading. */
export function KnowledgeSidePanelSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <ul
      className="side-panel-skeleton-list side-panel-skeleton-list--tight"
      aria-busy="true"
      aria-label="Loading knowledge documents"
    >
      {Array.from({ length: rows }, (_, index) => (
        <li
          key={index}
          className="knowledge-side-panel-skeleton-row"
          data-indent={
            index === 1 || index === 4
              ? "1"
              : index === 2 || index === 5
                ? "2"
                : undefined
          }
        >
          <SkeletonBlock className="knowledge-side-panel-skeleton-icon" />
          <SkeletonBlock className="knowledge-detail-skeleton-block knowledge-side-panel-skeleton-title" />
        </li>
      ))}
    </ul>
  );
}
