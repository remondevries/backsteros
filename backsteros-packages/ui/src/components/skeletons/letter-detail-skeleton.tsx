import { DOCUMENT_CONTENT_MAX_WIDTH } from "../../document-editor-theme.js";
import { SkeletonBlock } from "./skeleton-block.js";

export type LetterDetailSkeletonProps = {
  framed?: boolean;
};

/**
 * Letter loading state: notes (icon + title + body), bottom PDF strip, and
 * properties panel — matching the ready letter-detail layout.
 */
export function LetterDetailSkeleton({
  framed = true,
}: LetterDetailSkeletonProps) {
  const body = (
    <div
      className="detail-skeleton detail-skeleton--letter"
      aria-busy="true"
      aria-label="Loading letter"
      data-content-detail
      data-detail-split=""
    >
      <div className="document-pdf-main detail-skeleton__letter-main">
        <div className="detail-skeleton__scroll">
          <div
            className="detail-skeleton__column detail-skeleton__column--padded"
            style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
          >
            <div className="detail-skeleton__title-stack">
              <SkeletonBlock className="letter-detail-skeleton-icon" />
              <SkeletonBlock className="letter-detail-skeleton-title" />
            </div>

            <div className="detail-skeleton__lines">
              <SkeletonBlock className="letter-detail-skeleton-line letter-detail-skeleton-line--wide" />
              <SkeletonBlock className="letter-detail-skeleton-line" />
              <SkeletonBlock className="letter-detail-skeleton-line letter-detail-skeleton-line--medium" />
              <SkeletonBlock className="letter-detail-skeleton-line letter-detail-skeleton-line--short" />
              <SkeletonBlock className="letter-detail-skeleton-line letter-detail-skeleton-line--wide" />
            </div>
          </div>
        </div>

        <div className="letter-detail-skeleton-pdf-bottom">
          <SkeletonBlock className="letter-detail-skeleton-pdf-surface letter-detail-skeleton-pdf-surface--bottom" />
        </div>
      </div>

      <aside className="letter-detail-skeleton-properties">
        <div className="letter-detail-skeleton-properties__scroll">
          <div className="detail-skeleton__lines detail-skeleton__lines--tight">
            <section className="letter-detail-skeleton-section">
              <SkeletonBlock className="letter-detail-skeleton-section-label" />
              <div className="letter-detail-skeleton-section__props">
                <SkeletonBlock className="letter-detail-skeleton-property" />
                <SkeletonBlock className="letter-detail-skeleton-property" />
              </div>
            </section>
            <section className="letter-detail-skeleton-section">
              <SkeletonBlock className="letter-detail-skeleton-section-label" />
              <div className="letter-detail-skeleton-section__props">
                <SkeletonBlock className="letter-detail-skeleton-property" />
                <SkeletonBlock className="letter-detail-skeleton-property" />
                <SkeletonBlock className="letter-detail-skeleton-property" />
                <SkeletonBlock className="letter-detail-skeleton-property letter-detail-skeleton-property--tall" />
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

  return <div className="detail-skeleton-frame">{body}</div>;
}

/** Side-panel letter list rows while letters are loading. */
export function LettersSidePanelSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul
      className="side-panel-skeleton-list"
      aria-busy="true"
      aria-label="Loading letters"
    >
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="letter-side-panel-skeleton-row">
          <SkeletonBlock className="letter-side-panel-skeleton-icon" />
          <div className="side-panel-skeleton-list__lines">
            <SkeletonBlock className="letter-side-panel-skeleton-title" />
            <SkeletonBlock className="letter-side-panel-skeleton-meta" />
          </div>
        </li>
      ))}
    </ul>
  );
}
