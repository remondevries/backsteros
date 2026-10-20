"use client";

import { useRef, type ReactNode } from "react";

import type { KnowledgeListItem } from "../../navigation/entity-routes.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import { DocumentIcon } from "../documents/document-icon.js";
import { HairlineEmptyFigure } from "../shared/hairline-empty-figure.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";

export type ProjectDocumentsSectionViewProps = {
  documents: KnowledgeListItem[];
  onSelectDocument?: (document: KnowledgeListItem) => void;
  selectedDocumentId?: string | null;
  emptyMessage?: ReactNode;
};

/** Project documents pane — flat list matching the web project docs index. */
export function ProjectDocumentsSectionView({
  documents,
  onSelectDocument,
  selectedDocumentId = null,
  emptyMessage,
}: ProjectDocumentsSectionViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );
  const itemIds = documents.map((document) => document.id);
  const resolvedEmpty = emptyMessage ?? (
    <HairlineEmptyFigure
      size={200}
      label="No documents"
      caption="No documents"
    />
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedDocumentId,
    onNavigate: (documentId) => {
      const document = documents.find((entry) => entry.id === documentId);
      if (document) onSelectDocument?.(document);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  if (!documents.length) {
    return (
      <div className="project-detail__placeholder">
        {typeof resolvedEmpty === "string" ? (
          <p className="overview-empty">{resolvedEmpty}</p>
        ) : (
          resolvedEmpty
        )}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="project-detail__entity-list"
      aria-label="Project documents"
      {...listContainerProps}
    >
      <ul className="overview-grouped-list" role="list">
        {documents.map((document) => (
          <li key={document.id} {...keyboardNavItemProps(document.id)}>
            <button
              type="button"
              className={`project-detail__entity-row ${keyboardNavListItemClass(highlightedId === document.id)}`}
              onClick={() => onSelectDocument?.(document)}
            >
              <span
                className="project-detail__entity-row-icon"
                aria-hidden="true"
              >
                <DocumentIcon size={14} />
              </span>
              <span className="project-detail__entity-row-label">
                {document.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
