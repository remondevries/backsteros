"use client";

/**
 * @deprecated Search mode is shown on the List/Board toggle (purple active
 * segment) via `body[data-list-type-to-filter-search]`. Kept as a no-op so
 * older call sites do not break.
 */
export function ListTypeToFilterIndicator(_props: { active: boolean }) {
  return null;
}
