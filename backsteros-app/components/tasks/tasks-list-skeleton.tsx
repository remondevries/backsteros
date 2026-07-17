"use client";

import { useState } from "react";

import { TaskStatusIcon } from "@/components/task-status";
import { TaskStatusGroupSection } from "@/components/tasks/task-status-group-section";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";
import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "@/lib/task-status";

type TasksListSkeletonProps = {
  /** Skeleton rows under each status group header. */
  itemsPerGroup?: number;
};

function TasksSkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      className={[
        "tasks-list-skeleton-block inline-block shrink-0 bg-white/10 animate-pulse",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

function TaskRowSkeleton({ index }: { index: number }) {
  const fadeClass =
    index === 1
      ? "tasks-list-skeleton-row--fade-mid"
      : index === 2
        ? "tasks-list-skeleton-row--fade-end"
        : "tasks-list-skeleton-row--fade-start";

  if (isMobileShellBuildActive()) {
    return (
      <li className="list-none">
        <div
          className={`tasks-list-skeleton-row tasks-list-skeleton-row--mobile ${fadeClass} flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5`}
          data-skeleton-index={index}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <TasksSkeletonBlock className="tasks-list-skeleton-status h-3.5 w-3.5 rounded-full" />
              <TasksSkeletonBlock className="tasks-list-skeleton-title tasks-list-skeleton-title--mobile h-3 min-w-24 flex-1 rounded-md" />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <TasksSkeletonBlock className="tasks-list-skeleton-priority h-3.5 w-3.5 rounded-full" />
              <TasksSkeletonBlock className="tasks-list-skeleton-due h-3 w-[4.5rem] rounded" />
              <TasksSkeletonBlock className="tasks-list-skeleton-project h-3 w-[5.5rem] rounded" />
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="list-none">
      <div
        className={`tasks-list-skeleton-row ${fadeClass} flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5`}
        data-skeleton-index={index}
      >
        <TasksSkeletonBlock className="tasks-list-skeleton-priority h-3.5 w-3.5 rounded-full" />
        <TasksSkeletonBlock className="tasks-list-skeleton-id h-3 w-[3.25rem] rounded" />
        <TasksSkeletonBlock className="tasks-list-skeleton-status h-3.5 w-3.5 rounded-full" />
        <TasksSkeletonBlock
          className={[
            "tasks-list-skeleton-title h-3 rounded-md",
            index === 1 ? "w-36" : index === 2 ? "w-[14.5rem]" : "w-48",
          ].join(" ")}
        />
        <TasksSkeletonBlock className="tasks-list-skeleton-project h-3 w-[5.5rem] rounded" />
        <TasksSkeletonBlock className="tasks-list-skeleton-due h-3 w-[4.5rem] rounded" />
      </div>
    </li>
  );
}

/**
 * Tasks list loading state: real status group headers with 3 item-shaped
 * skeleton rows each — matching the ready task-row layout.
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
            <TaskStatusGroupSection
              key={status}
              groupKey={status}
              title={label}
              icon={
                <TaskStatusIcon status={status} size={14} title={label} />
              }
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
            </TaskStatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
