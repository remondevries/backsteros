"use client";

import type { CSSProperties, DragEvent, ReactNode } from "react";

import type {
  GroupedListPointerAppendBind,
  GroupedListPointerItemBind,
} from "../use-grouped-list-pointer-reorder.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../keyboard-nav-item.js";
import { useStickyStuck } from "../use-sticky-stuck.js";
import { getTaskStatusHeaderGradientStyle } from "../task-status-header-gradient.js";
import type { TaskStatus } from "../task-status.js";
import { PolishedCheckbox } from "./polished-checkbox.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type StatusGroupSectionListDrag = {
  appendOrderKey: string;
  isActive: (dataTransfer: DataTransfer) => boolean;
  onDrop: (dataTransfer: DataTransfer) => void;
};

export type StatusGroupSectionSelection = {
  checked: boolean;
  indeterminate?: boolean;
  ariaLabel?: string;
  onChange: (checked: boolean) => void;
};

export type StatusGroupSectionProps = {
  groupKey: TaskStatus | string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
  /** Override the default task-status header gradient (e.g. category color). */
  headerStyle?: CSSProperties;
  /** Marks the group as the active/selected entity (e.g. finance categories). */
  highlighted?: boolean;
  /**
   * Keep the expand chevron always visible (next to the icon) and use it as
   * the only collapse control. Title clicks use `onTitleClick` when set.
   */
  persistentChevron?: boolean;
  /** Optional title/select handler when `persistentChevron` is enabled. */
  onTitleClick?: () => void;
  /** Optional + control (project tasks / letters), matching web group headers. */
  onAdd?: () => void;
  addActionLabel?: string;
  /** Optional trailing content on the right of the group header (e.g. month totals). */
  trailing?: ReactNode;
  /**
   * When set, hides the status icon, shows the chevron by default, and swaps
   * the chevron for a select checkbox on hover (or while selected).
   */
  selection?: StatusGroupSectionSelection | null;
  /** Insert-before indicator key while list-dragging. */
  dragInsertBeforeKey?: string | null;
  onDragInsertBeforeKey?: (orderKey: string | null) => void;
  onListDragEnd?: () => void;
  /** Generic HTML5 list drag (projects / tasks / letters). */
  listDrag?: StatusGroupSectionListDrag;
  /**
   * Pointer-based append-zone bind (Tauri/WebKit-safe).
   * When set, HTML5 header drop handlers are skipped.
   */
  pointerReorderAppend?: GroupedListPointerAppendBind | null;
  /** When true with pointerReorderAppend, show the append insert indicator. */
  showPointerAppendIndicator?: boolean;
  /**
   * When set, the section itself is a reorderable list item (e.g. finance
   * category parents with children).
   */
  pointerReorderItem?: GroupedListPointerItemBind | null;
  /** True while this section is the active pointer-drag source. */
  dragging?: boolean;
  /** Insert-before indicator while another item targets this section. */
  showDragInsertBefore?: boolean;
  /** Keyboard j/k target id (finance category parents, etc.). */
  keyboardNavItemId?: string | null;
  /** True while this section is the keyboard-highlighted row. */
  keyboardHighlighted?: boolean;
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 3.5V12.5M3.5 8H12.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StatusGroupSection({
  groupKey,
  title,
  collapsed,
  onToggle,
  children,
  icon,
  headerStyle,
  highlighted = false,
  persistentChevron = false,
  onTitleClick,
  onAdd,
  addActionLabel = "task",
  trailing = null,
  selection = null,
  dragInsertBeforeKey = null,
  onDragInsertBeforeKey,
  onListDragEnd,
  listDrag,
  pointerReorderAppend = null,
  showPointerAppendIndicator = false,
  pointerReorderItem = null,
  dragging = false,
  showDragInsertBefore = false,
  keyboardNavItemId = null,
  keyboardHighlighted = false,
}: StatusGroupSectionProps) {
  const { stuck, sentinelRef } = useStickyStuck();
  const selectMode = selection != null;
  const isSelected = Boolean(
    selection && (selection.checked || selection.indeterminate),
  );
  const resolvedIcon = selectMode
    ? null
    : (icon ?? <TaskStatusIcon status={groupKey} size={14} title={title} />);
  const pointerAppendEnabled = Boolean(pointerReorderAppend);
  const pointerItemEnabled = Boolean(pointerReorderItem);
  const html5DragEnabled = Boolean(listDrag) && !pointerAppendEnabled;
  const showAppendIndicator = pointerAppendEnabled
    ? showPointerAppendIndicator
    : html5DragEnabled &&
      listDrag != null &&
      dragInsertBeforeKey === listDrag.appendOrderKey;

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
    <li
      className={[
        "status-group-section",
        highlighted || isSelected ? "is-selected" : null,
        showDragInsertBefore ? "status-group-section--insert-before" : null,
        dragging ? "status-group-section--dragging" : null,
        pointerItemEnabled ? "status-group-section--draggable" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-group={groupKey}
      data-tauri-drag-region="false"
      {...(keyboardNavItemId ? keyboardNavItemProps(keyboardNavItemId) : {})}
    >
      <div
        ref={sentinelRef}
        className="status-group-sticky-sentinel"
        aria-hidden="true"
      />
      <div
        className={[
          "status-group-header-row",
          stuck ? "is-stuck" : null,
          pointerItemEnabled ? "status-group-header-row--draggable" : null,
          keyboardNavItemId
            ? keyboardNavListItemClass(keyboardHighlighted)
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={headerStyle ?? getTaskStatusHeaderGradientStyle(groupKey)}
        onDragOver={html5DragEnabled ? handleHeaderDragOver : undefined}
        onDrop={html5DragEnabled ? handleHeaderDrop : undefined}
        {...(pointerReorderItem ?? {})}
      >
        {persistentChevron ? (
          <div className="status-group-header-main">
            <span className="status-group-toggle-slot status-group-toggle-slot--persistent">
              <button
                type="button"
                className="status-group-chevron-btn"
                aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
                aria-expanded={!collapsed}
                onClick={onToggle}
              >
                <span
                  className="status-group-chevron"
                  data-expanded={!collapsed}
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
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
              </button>
              {resolvedIcon ? (
                <span className="status-group-icon" aria-hidden="true">
                  {resolvedIcon}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="status-group-header"
              data-has-icon="false"
              data-persistent-chevron="true"
              data-selected={highlighted || isSelected ? "true" : undefined}
              onClick={onTitleClick ?? onToggle}
            >
              <span className="status-group-title">{title}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="status-group-header"
            aria-expanded={!collapsed}
            data-has-icon={selectMode || !resolvedIcon ? "false" : "true"}
            data-select={selectMode ? "true" : undefined}
            data-selected={isSelected ? "true" : undefined}
            onClick={onToggle}
          >
            <span className="status-group-toggle-slot">
              {resolvedIcon ? (
                <span className="status-group-icon" aria-hidden="true">
                  {resolvedIcon}
                </span>
              ) : null}
              <span
                className="status-group-chevron"
                data-expanded={!collapsed}
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
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
                  className="status-group-select"
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
            <span className="status-group-title">{title}</span>
          </button>
        )}
        {trailing ? (
          <div className="status-group-trailing">{trailing}</div>
        ) : null}
        {onAdd ? (
          <button
            type="button"
            className="status-group-add"
            aria-label={`Add ${addActionLabel} to ${title}`}
            onClick={onAdd}
          >
            <PlusIcon />
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <ul className="status-group-items">
          {children}
          {pointerAppendEnabled ? (
            <li
              className={[
                "status-group-append-zone",
                showAppendIndicator
                  ? "status-group-append-zone--active"
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
              {...(pointerReorderAppend ?? {})}
            />
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
