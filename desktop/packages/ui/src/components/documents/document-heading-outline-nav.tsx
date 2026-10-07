"use client";

import type { DocumentHeadingMinimapItem } from "../../documents/document-heading-minimap.js";

export type DocumentHeadingOutlineNavProps = {
  items: ReadonlyArray<DocumentHeadingMinimapItem>;
  inViewIds: ReadonlySet<string>;
  onSelect: (item: DocumentHeadingMinimapItem) => void;
  title?: string;
};

/**
 * Proposal-site style outline: titled heading links with a left border rail.
 * Used when the finance side panel is collapsed to a rail and frees width.
 */
export function DocumentHeadingOutlineNav({
  items,
  inViewIds,
  onSelect,
  title = "Contents",
}: DocumentHeadingOutlineNavProps) {
  if (items.length === 0) return null;

  const activeId =
    items.find((item) => inViewIds.has(item.id))?.id ?? items[0]?.id ?? null;

  return (
    <nav
      className="document-heading-outline"
      aria-label={title}
      data-document-heading-outline
    >
      <p className="document-heading-outline__title">{title}</p>
      <ul className="document-heading-outline__list">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="document-heading-outline__item">
              <button
                type="button"
                className={[
                  "document-heading-outline__link",
                  `document-heading-outline__link--h${item.level}`,
                  active ? "is-active" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelect(item)}
              >
                {item.text}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
