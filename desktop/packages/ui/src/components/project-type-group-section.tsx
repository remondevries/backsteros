"use client";

import type { DragEvent, ReactNode } from "react";

import type { GroupedListPointerAppendBind } from "../list-nav/use-grouped-list-pointer-reorder.js";
import { PolishedCheckbox } from "./polished-checkbox.js";

export type ProjectTypeGroupSectionListDrag = {
  appendOrderKey: string;
  isActive: (dataTransfer: DataTransfer) => boolean;
  onDrop: (dataTransfer: DataTransfer) => void;
};

export type ProjectTypeGroupSectionSelection = {
  checked: boolean;
  indeterminate?: boolean;
  ariaLabel?: string;
  onChange: (checked: boolean) => void;
};

export type ProjectTypeGroupSectionProps = {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Optional + control (Areas page create-in-group). */
  onAdd?: () => void;
  addActionLabel?: string;
  /** Optional content before header actions (e.g. Spent / Budget labels). */
  trailing?: ReactNode;
  /** Optional delete control (nested custom areas) — shown on header hover. */
  onDelete?: () => void;
  deleteActionLabel?: string;
  /**
   * When set, swaps the chevron for a select checkbox on hover
   * (or while selected).
   */
  selection?: ProjectTypeGroupSectionSelection | null;
  dragInsertBeforeKey?: string | null;
  onDragInsertBeforeKey?: (orderKey: string | null) => void;
  onListDragEnd?: () => void;
  listDrag?: ProjectTypeGroupSectionListDrag;
  /** Pointer-based append-zone bind (Tauri/WebKit-safe). */
  pointerReorderAppend?: GroupedListPointerAppendBind | null;
  showPointerAppendIndicator?: boolean;
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M8 3.5V12.5M3.5 8H12.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M6.5 2.75h3M3.5 4.25h9M5.25 4.25V12.5a1 1 0 0 0 1 1h3.5a1 1 0 0 0 1-1V4.25M6.75 6.5v4.5M9.25 6.5v4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Nested type subgroup inside a status group (e.g. Codebase under Active).
 * Also used as top-level area groups on the Areas page (label + rule).
 * Default/general projects render without this wrapper.
 */
export function ProjectTypeGroupSection({
  title,
  collapsed,
  onToggle,
  children,
  onAdd,
  addActionLabel = "project",
  trailing = null,
  onDelete,
  deleteActionLabel = "area",
  selection = null,
  dragInsertBeforeKey = null,
  onDragInsertBeforeKey,
  onListDragEnd,
  listDrag,
  pointerReorderAppend = null,
  showPointerAppendIndicator = false,
}: ProjectTypeGroupSectionProps) {
  const pointerAppendEnabled = Boolean(pointerReorderAppend);
  const html5DragEnabled = Boolean(listDrag) && !pointerAppendEnabled;
  const showAppendIndicator = pointerAppendEnabled
    ? showPointerAppendIndicator
    : html5DragEnabled &&
      listDrag != null &&
      dragInsertBeforeKey === listDrag.appendOrderKey;
  const showActions = Boolean(onAdd || onDelete);
  const selectMode = selection != null;
  const isSelected = Boolean(
    selection && (selection.checked || selection.indeterminate),
  );

  function handleHeaderDragOver(event: DragEvent) {
    if (!listDrag || !listDrag.isActive(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    onDragInsertBeforeKey?.(listDrag.appendOrderKey);
  }

  function handleHeaderDrop(event: DragEvent) {
    if (!listDrag) return;
    event.preventDefault();
    event.stopPropagation();
    onListDragEnd?.();
    listDrag.onDrop(event.dataTransfer);
  }

  return (
    <li className="project-type-subgroup" data-type-group={title}>
      <div
        className={[
          "project-type-subgroup__header-row",
          showAppendIndicator
            ? "project-type-subgroup__header-row--drop-append"
            : null,
          showActions ? "project-type-subgroup__header-row--has-actions" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onDragOver={html5DragEnabled ? handleHeaderDragOver : undefined}
        onDrop={html5DragEnabled ? handleHeaderDrop : undefined}
        {...(pointerReorderAppend ?? {})}
      >
        <button
          type="button"
          className="project-type-subgroup__header"
          aria-expanded={!collapsed}
          data-select={selectMode ? "true" : undefined}
          data-selected={isSelected ? "true" : undefined}
          onClick={onToggle}
        >
          <span className="project-type-subgroup__toggle-slot">
            <span
              className="project-type-subgroup__toggle"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path
                  d="M9 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {selection ? (
              <span
                className="project-type-subgroup__select"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <PolishedCheckbox
                  checked={selection.checked}
                  indeterminate={selection.indeterminate}
                  ariaLabel={selection.ariaLabel ?? `Select ${title}`}
                  onCheckedChange={(checked) => selection.onChange(checked)}
                />
              </span>
            ) : null}
          </span>
          <span className="project-type-subgroup__label">{title}</span>
          <span className="project-type-subgroup__rule" aria-hidden="true" />
        </button>
        {trailing ? (
          <div className="project-type-subgroup__trailing">{trailing}</div>
        ) : null}
        {showActions ? (
          <span className="project-type-subgroup__actions">
            {onAdd ? (
              <button
                type="button"
                className="project-type-subgroup__add"
                aria-label={`Add ${addActionLabel} to ${title}`}
                onClick={onAdd}
              >
                <PlusIcon />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="project-type-subgroup__delete"
                aria-label={`Delete ${deleteActionLabel} ${title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <TrashIcon />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {!collapsed ? (
        <ul className="project-type-subgroup__items">{children}</ul>
      ) : null}
    </li>
  );
}
