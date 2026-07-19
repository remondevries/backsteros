import { DOCUMENT_CONTENT_MAX_WIDTH } from "../../document-editor-theme.js";
import { SkeletonBlock } from "./skeleton-block.js";

export type JournalDetailSkeletonProps = {
  /** When false, omit the outer content-detail shell (parent already provides it). */
  framed?: boolean;
  /**
   * When false, omit Whoop ring placeholders — parent is rendering live
   * `JournalWhoopLeading` (or its skeleton) in parallel with content load.
   */
  includeWhoop?: boolean;
};

/** Whoop ring placeholders — used while Whoop loads independently of content. */
export function JournalWhoopHeaderSkeleton() {
  return (
    <div className="journal-whoop-header-skeleton" aria-hidden="true">
      <SkeletonBlock className="journal-whoop-header-skeleton__ring" />
      <SkeletonBlock className="journal-whoop-header-skeleton__ring" />
      <SkeletonBlock className="journal-whoop-header-skeleton__ring" />
    </div>
  );
}

/**
 * Full-page journal loading state: Whoop rings, icon + title, body lines, and
 * due-task rows — matching the ready layout so content does not jump.
 */
export function JournalDetailSkeleton({
  framed = true,
  includeWhoop = true,
}: JournalDetailSkeletonProps) {
  const body = (
    <div
      className="detail-skeleton detail-skeleton--fill"
      aria-busy="true"
      aria-label="Loading journal entry"
    >
      {includeWhoop ? (
        <div
          className="detail-skeleton__column detail-skeleton__column--whoop"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <div className="journal-detail-skeleton-whoop">
            <JournalWhoopHeaderSkeleton />
          </div>
        </div>
      ) : null}

      <div className="detail-skeleton__scroll detail-skeleton__scroll--padded">
        <div
          className="detail-skeleton__column detail-skeleton__column--padded"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <div className="detail-skeleton__title-stack">
            <SkeletonBlock className="journal-detail-skeleton-icon" />
            <SkeletonBlock className="journal-detail-skeleton-title" />
          </div>

          <div className="detail-skeleton__lines">
            <SkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--wide" />
            <SkeletonBlock className="journal-detail-skeleton-line" />
            <SkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--medium" />
            <SkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--short" />
            <SkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--wide" />
            <SkeletonBlock className="journal-detail-skeleton-line journal-detail-skeleton-line--medium" />
          </div>
        </div>

        <section
          className="detail-skeleton__column detail-skeleton__column--tasks"
          style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
        >
          <p className="journal-detail-skeleton-tasks-label">Tasks</p>
          <ul className="journal-detail-skeleton-tasks">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="journal-detail-skeleton-task">
                <SkeletonBlock className="journal-detail-skeleton-task-status" />
                <SkeletonBlock className="journal-detail-skeleton-task-title" />
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
    <div className="detail-skeleton-frame" data-content-detail>
      {body}
    </div>
  );
}
