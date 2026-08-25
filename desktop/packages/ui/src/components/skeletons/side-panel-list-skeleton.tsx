import { SkeletonBlock } from "./skeleton-block.js";

export type SidePanelListSkeletonVariant = "rows" | "tree";

export type SidePanelListSkeletonProps = {
  rows?: number;
  /** `rows` — icon + title + meta (inbox/letters). `tree` — indented doc tree. */
  variant?: SidePanelListSkeletonVariant;
  /** Accessible label for the busy list. */
  label?: string;
  className?: string;
};

/**
 * Shared side-panel list skeleton for inbox, letters, knowledge, etc.
 */
export function SidePanelListSkeleton({
  rows = 6,
  variant = "rows",
  label = "Loading",
  className = "",
}: SidePanelListSkeletonProps) {
  if (variant === "tree") {
    return (
      <ul
        className={[
          "side-panel-skeleton-list",
          "side-panel-skeleton-list--tight",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-busy="true"
        aria-label={label}
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

  return (
    <ul
      className={["side-panel-skeleton-list", className]
        .filter(Boolean)
        .join(" ")}
      aria-busy="true"
      aria-label={label}
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
