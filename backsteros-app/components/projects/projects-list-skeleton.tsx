"use client";

import { useState } from "react";

import { ProjectsListHeader } from "@/components/projects/projects-list-header";
import { ProjectStatusIcon } from "@/components/project-status";
import { TaskStatusGroupSection } from "@/components/tasks/task-status-group-section";
import { isMobileShellBuildActive } from "@/lib/mobile/is-mobile-shell-env";
import {
  PROJECT_LIST_GRID_CLASS,
  PROJECT_LIST_NUMERIC_CELL_CLASS,
} from "@/lib/projects-list-columns";
import {
  getProjectStatusLabel,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "@/lib/project-status";
import { mapProjectStatusToTaskStatusIcon } from "@/lib/project-status-icon";

type ProjectsListSkeletonProps = {
  /** Skeleton rows under each status group header. */
  itemsPerGroup?: number;
};

function ProjectsSkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      className={[
        "projects-list-skeleton-block inline-block shrink-0 bg-white/10 animate-pulse",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

function ProjectRowSkeleton({ index }: { index: number }) {
  const fadeClass =
    index === 1
      ? "projects-list-skeleton-row--fade-mid"
      : index === 2
        ? "projects-list-skeleton-row--fade-end"
        : "projects-list-skeleton-row--fade-start";

  if (isMobileShellBuildActive()) {
    return (
      <li className="list-none">
        <div
          className={`projects-list-skeleton-row projects-list-skeleton-row--mobile ${fadeClass} flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5`}
          data-skeleton-index={index}
        >
          <ProjectsSkeletonBlock className="projects-list-skeleton-icon h-3.5 w-3.5 rounded" />
          <ProjectsSkeletonBlock className="projects-list-skeleton-title projects-list-skeleton-title--mobile h-3 min-w-24 flex-1 rounded-md" />
          <ProjectsSkeletonBlock className="projects-list-skeleton-status h-3.5 w-3.5 rounded-full" />
        </div>
      </li>
    );
  }

  return (
    <li className="list-none">
      <div
        className={`${PROJECT_LIST_GRID_CLASS} projects-list-skeleton-row ${fadeClass} rounded-md py-2.5`}
        data-skeleton-index={index}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ProjectsSkeletonBlock className="projects-list-skeleton-icon h-3.5 w-3.5 rounded" />
          <ProjectsSkeletonBlock className="projects-list-skeleton-key h-3 w-11 rounded" />
          <ProjectsSkeletonBlock className="projects-list-skeleton-status h-3.5 w-3.5 rounded-full" />
          <ProjectsSkeletonBlock
            className={[
              "projects-list-skeleton-title h-3 rounded-md",
              index === 1
                ? "w-[8.5rem]"
                : index === 2
                  ? "w-[13.5rem]"
                  : "w-44",
            ].join(" ")}
          />
        </div>

        <div aria-hidden="true" />

        <div className="flex justify-center">
          <ProjectsSkeletonBlock className="projects-list-skeleton-priority h-3.5 w-3.5 rounded-full" />
        </div>

        <div className="inline-flex min-w-0 items-center gap-1">
          <ProjectsSkeletonBlock className="projects-list-skeleton-date h-3 w-[4.25rem] rounded" />
          <span className="text-sm text-foreground/40" aria-hidden="true">
            ›
          </span>
          <ProjectsSkeletonBlock className="projects-list-skeleton-date projects-list-skeleton-date--end h-3 w-14 rounded" />
        </div>

        <div className={`${PROJECT_LIST_NUMERIC_CELL_CLASS} flex justify-center`}>
          <ProjectsSkeletonBlock className="projects-list-skeleton-issues h-3 w-5 rounded" />
        </div>

        <div className="inline-flex items-center justify-end gap-1">
          <ProjectsSkeletonBlock className="projects-list-skeleton-percent h-3 w-9 rounded" />
          <ProjectsSkeletonBlock className="projects-list-skeleton-ring h-3.5 w-3.5 rounded-full" />
        </div>
      </div>
    </li>
  );
}

/**
 * Projects list loading state: real status group headers with 3 item-shaped
 * skeleton rows each — matching the ready projects list layout.
 */
export function ProjectsListSkeleton({
  itemsPerGroup = 3,
}: ProjectsListSkeletonProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ProjectStatus>>(
    () => new Set(),
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto"
      aria-busy="true"
      aria-label="Loading projects"
    >
      <ProjectsListHeader />
      <ul className="flex flex-col gap-1 pt-1" role="list">
        {PROJECT_STATUS_ORDER.map((status) => {
          const collapsed = collapsedGroups.has(status);
          const label = getProjectStatusLabel(status);
          const headerStatus = mapProjectStatusToTaskStatusIcon(status);

          return (
            <TaskStatusGroupSection
              key={status}
              groupKey={headerStatus}
              title={label}
              icon={
                <ProjectStatusIcon status={status} size={14} title={label} />
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
                <ProjectRowSkeleton key={index} index={index} />
              ))}
            </TaskStatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
