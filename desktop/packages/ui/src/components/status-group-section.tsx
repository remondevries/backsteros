"use client";

import type { DragEvent, ReactNode } from "react";

import type { GroupedListPointerAppendBind } from "../use-grouped-list-pointer-reorder.js";
import { getTaskStatusHeaderGradientStyle } from "../task-status-header-gradient.js";
import type { TaskStatus } from "../task-status.js";
import { TaskStatusIcon } from "./task-status-icon.js";

export type StatusGroupSectionListDrag = {
  appendOrderKey: string;
  isActive: (dataTransfer: DataTransfer) => boolean;
  onDrop: (dataTransfer: DataTransfer) => void;
};

export type StatusGroupSectionProps = {
  groupKey: TaskStatus | string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
  /** Optional + control (project tasks / letters), matching web group headers. */
  onAdd?: () => void;
  addActionLabel?: string;
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
  onAdd,
  addActionLabel = "task",
  dragInsertBeforeKey = null,
  onDragInsertBeforeKey,
  onListDragEnd,
  listDrag,
  pointerReorderAppend = null,
  showPointerAppendIndicator = false,
}: StatusGroupSectionProps) {
  const resolvedIcon =
    icon ?? <TaskStatusIcon status={groupKey} size={14} title={title} />;
  const pointerAppendEnabled = Boolean(pointerReorderAppend);
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
    <li className="status-group-section" data-group={groupKey}>
      <div
        className={[
          "status-group-header-row",
          showAppendIndicator ? "status-group-header-row--drop-append" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={getTaskStatusHeaderGradientStyle(groupKey)}
        onDragOver={html5DragEnabled ? handleHeaderDragOver : undefined}
        onDrop={html5DragEnabled ? handleHeaderDrop : undefined}
        {...(pointerReorderAppend ?? {})}
      >
        <button
          type="button"
          className="status-group-header"
          aria-expanded={!collapsed}
          data-has-icon="true"
          onClick={onToggle}
        >
          <span className="status-group-toggle-slot" aria-hidden="true">
            <span className="status-group-icon">{resolvedIcon}</span>
            <span className="status-group-chevron" data-expanded={!collapsed}>
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
          </span>
          <span className="status-group-title">{title}</span>
        </button>
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
      {!collapsed ? <ul className="status-group-items">{children}</ul> : null}
    </li>
  );
}
