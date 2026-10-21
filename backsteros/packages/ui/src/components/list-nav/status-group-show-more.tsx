"use client";

import type { ReactElement } from "react";

export type StatusGroupShowMoreButtonProps = {
  hiddenCount: number;
  onShowMore: () => void;
  /** Use `div` inside virtualized lists (rows are not nested `<ul>` children). */
  as?: "li" | "div";
};

/**
 * Footer control under a capped status group (e.g. Completed emails).
 */
export function StatusGroupShowMoreButton({
  hiddenCount,
  onShowMore,
  as = "li",
}: StatusGroupShowMoreButtonProps): ReactElement | null {
  if (hiddenCount <= 0) return null;
  const Tag = as;
  return (
    <Tag className="status-group-show-more">
      <button
        type="button"
        className="status-group-show-more__btn"
        onClick={onShowMore}
        aria-label={`Show more, ${hiddenCount} remaining`}
      >
        Show more
      </button>
    </Tag>
  );
}
