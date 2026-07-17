"use client";

import type { DragEvent, ReactNode } from "react";

import {
  getTaskStatusHeaderGradientStyle,
} from "@/lib/task-status-header-gradient";
import type { TaskStatus } from "@/lib/task-status";

import {
  groupAppendOrderKey,
  isTaskListDragActive,
  readTaskDragPayload,
  resolveTaskDropOnGroupAppend,
  type TaskReorderRequest,
} from "./task-list-drag";
import {
  isLetterListDragActive,
  letterGroupAppendOrderKey,
  readLetterDragPayload,
  resolveLetterDropOnGroupAppend,
  type LetterReorderRequest,
} from "@/components/letters/letter-list-drag";

function GroupChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      className={`text-foreground/40 transition-transform duration-150 ${
        expanded ? "rotate-90" : "rotate-0"
      }`}
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
  );
}

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

type TaskStatusGroupSectionProps = {
  groupKey: TaskStatus;
  title: string;
  icon?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  onAddTask?: () => void;
  addActionLabel?: string;
  children: ReactNode;
  dragInsertBeforeKey?: string | null;
  onDragInsertBeforeKey?: (orderKey: string | null) => void;
  onTaskDragEnd?: () => void;
  onReorderTask?: (request: TaskReorderRequest) => void;
  onLetterDragEnd?: () => void;
  onReorderLetter?: (request: LetterReorderRequest) => void;
  onExpandGroup?: () => void;
  listDrag?: {
    appendOrderKey: string;
    isActive: (dataTransfer: DataTransfer) => boolean;
    onDrop: (dataTransfer: DataTransfer) => void;
  };
};

export function TaskStatusGroupSection({
  groupKey,
  title,
  icon,
  collapsed,
  onToggle,
  onAddTask,
  addActionLabel = "task",
  children,
  dragInsertBeforeKey,
  onDragInsertBeforeKey,
  onTaskDragEnd,
  onReorderTask,
  onLetterDragEnd,
  onReorderLetter,
  onExpandGroup,
  listDrag,
}: TaskStatusGroupSectionProps) {
  const headerGradientStyle = getTaskStatusHeaderGradientStyle(groupKey);
  const appendOrderKey =
    listDrag?.appendOrderKey ??
    (onReorderLetter
      ? letterGroupAppendOrderKey(groupKey)
      : groupAppendOrderKey(groupKey));
  const showAppendIndicator = dragInsertBeforeKey === appendOrderKey;
  const dragEnabled = Boolean(listDrag || onReorderTask || onReorderLetter);

  function isActiveDrag(dataTransfer: DataTransfer) {
    if (listDrag?.isActive(dataTransfer)) {
      return true;
    }
    if (onReorderLetter && isLetterListDragActive(dataTransfer)) {
      return true;
    }
    if (onReorderTask && isTaskListDragActive(dataTransfer)) {
      return true;
    }
    return false;
  }

  function handleHeaderDragOver(event: DragEvent) {
    if (!dragEnabled || !isActiveDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.stopPropagation();
    onDragInsertBeforeKey?.(appendOrderKey);
  }

  function handleHeaderDrop(event: DragEvent) {
    if (!dragEnabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onTaskDragEnd?.();
    onLetterDragEnd?.();

    if (listDrag) {
      listDrag.onDrop(event.dataTransfer);
      return;
    }

    if (onReorderLetter) {
      const payload = readLetterDragPayload(event.dataTransfer);
      if (!payload) {
        return;
      }

      const action = resolveLetterDropOnGroupAppend({
        payload,
        status: groupKey,
      });

      onExpandGroup?.();
      onReorderLetter(action);
      return;
    }

    const payload = readTaskDragPayload(event.dataTransfer);
    if (!payload) {
      return;
    }

    const action = resolveTaskDropOnGroupAppend({
      payload,
      status: groupKey,
    });

    if (action) {
      onExpandGroup?.();
      onReorderTask?.(action);
    }
  }

  return (
    <li className="group/header flex list-none flex-col gap-1">
      <div
        style={headerGradientStyle}
        className={`task-status-group-header sticky top-0 z-10 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-foreground ${
          showAppendIndicator ? "ring-1 ring-inset ring-[#ee7a47]/50" : ""
        }`}
        onDragOver={dragEnabled ? handleHeaderDragOver : undefined}
        onDrop={dragEnabled ? handleHeaderDrop : undefined}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-white/20"
        >
          <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            {icon ? (
              <span className="task-status-group-header__icon absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/header:opacity-0 group-focus-within/header:opacity-0">
                {icon}
              </span>
            ) : null}
            <span
              className={`task-status-group-header__chevron absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${
                icon
                  ? "opacity-0 group-hover/header:opacity-100 group-focus-within/header:opacity-100"
                  : "opacity-100"
              }`}
            >
              <GroupChevron expanded={!collapsed} />
            </span>
          </span>
          <span className="task-status-group-header__title min-w-0 flex-1 truncate font-medium">
            {title}
          </span>
        </button>

        {onAddTask ? (
          <button
            type="button"
            onClick={onAddTask}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground/50 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/20"
            aria-label={`Add ${addActionLabel} to ${title}`}
          >
            <PlusIcon />
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <ul className="app-side-panel-section-items m-0 list-none p-0">
          {children}
        </ul>
      ) : null}
    </li>
  );
}
