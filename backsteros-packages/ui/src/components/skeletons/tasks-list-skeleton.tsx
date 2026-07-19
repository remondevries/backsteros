"use client";

import { useState } from "react";

import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../task-status.js";
import { StatusGroupSection } from "../status-group-section.js";
import { TaskStatusIcon } from "../task-status-icon.js";
import { SkeletonBlock } from "./skeleton-block.js";

export type TasksListSkeletonProps = {
  /** Skeleton rows under each status group header. */
  itemsPerGroup?: number;
};

function fadeClassForIndex(index: number): string {
  if (index === 1) return "opacity-55";
  if (index === 2) return "opacity-25";
  return "opacity-100";
}

function TaskRowSkeleton({ index }: { index: number }) {
  const fadeClass = fadeClassForIndex(index);
  const titleWidth =
    index === 1 ? "w-36" : index === 2 ? "w-[14.5rem]" : "w-48";

  return (
    <li className="list-none">
      {/* Mobile */}
      <div
        className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5 md:hidden ${fadeClass}`}
        data-skeleton-index={index}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <SkeletonBlock
              as="span"
              className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
            />
            <SkeletonBlock
              as="span"
              className="inline-block h-3 min-w-24 flex-1 rounded-md"
            />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <SkeletonBlock
              as="span"
              className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
            />
            <SkeletonBlock
              as="span"
              className="inline-block h-3 w-[4.5rem] rounded"
            />
            <SkeletonBlock
              as="span"
              className="inline-block h-3 w-[5.5rem] rounded"
            />
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div
        className={`hidden w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5 md:flex ${fadeClass}`}
        data-skeleton-index={index}
      >
        <SkeletonBlock
          as="span"
          className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
        />
        <SkeletonBlock
          as="span"
          className="inline-block h-3 w-[3.25rem] shrink-0 rounded"
        />
        <SkeletonBlock
          as="span"
          className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
        />
        <SkeletonBlock
          as="span"
          className={`inline-block h-3 shrink-0 rounded-md ${titleWidth}`}
        />
        <SkeletonBlock
          as="span"
          className="inline-block h-3 w-[5.5rem] shrink-0 rounded"
        />
        <SkeletonBlock
          as="span"
          className="inline-block h-3 w-[4.5rem] shrink-0 rounded"
        />
      </div>
    </li>
  );
}

/**
 * Tasks list loading state: real status group headers with item-shaped
 * skeleton rows — matching the ready task-row layout (web + desktop).
 */
export function TasksListSkeleton({
  itemsPerGroup = 3,
}: TasksListSkeletonProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(
    () => new Set(),
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto"
      aria-busy="true"
      aria-label="Loading tasks"
    >
      <ul className="flex flex-col gap-1" role="list">
        {TASK_STATUS_ORDER.map((status) => {
          const collapsed = collapsedGroups.has(status);
          const label = getTaskStatusLabel(status);

          return (
            <StatusGroupSection
              key={status}
              groupKey={status}
              title={label}
              icon={<TaskStatusIcon status={status} size={14} title={label} />}
              collapsed={collapsed}
              onToggle={() =>
                setCollapsedGroups((current) => {
                  const next = new Set(current);
                  if (next.has(status)) next.delete(status);
                  else next.add(status);
                  return next;
                })
              }
            >
              {Array.from({ length: itemsPerGroup }, (_, index) => (
                <TaskRowSkeleton key={index} index={index} />
              ))}
            </StatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
