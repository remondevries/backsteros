"use client";

import { useState } from "react";

import {
  getProjectStatusLabel,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "../../project-status.js";
import { mapProjectStatusToTaskStatusIcon } from "../../project-status-icon-model.js";
import { ProjectStatusIcon } from "../project-status-icon.js";
import { ProjectsListHeader } from "../project-overview-row.js";
import { StatusGroupSection } from "../status-group-section.js";
import { SkeletonBlock } from "./skeleton-block.js";

export type ProjectsListSkeletonProps = {
  /** Skeleton rows under each status group header. */
  itemsPerGroup?: number;
};

function fadeClassForIndex(index: number): string {
  if (index === 1) return "opacity-55";
  if (index === 2) return "opacity-25";
  return "opacity-100";
}

function ProjectRowSkeleton({ index }: { index: number }) {
  const fadeClass = fadeClassForIndex(index);
  const titleWidth =
    index === 1 ? "w-[8.5rem]" : index === 2 ? "w-[13.5rem]" : "w-44";

  return (
    <li className="list-none">
      {/* Mobile */}
      <div
        className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2.5 md:hidden ${fadeClass}`}
        data-skeleton-index={index}
      >
        <SkeletonBlock
          as="span"
          className="inline-block h-3.5 w-3.5 shrink-0 rounded"
        />
        <SkeletonBlock
          as="span"
          className="inline-block h-3 min-w-24 flex-1 rounded-md"
        />
        <SkeletonBlock
          as="span"
          className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
        />
      </div>

      {/* Desktop — same grid as project-overview-row */}
      <div
        className={`project-overview-row pointer-events-none hidden md:grid ${fadeClass}`}
        data-skeleton-index={index}
        aria-hidden="true"
      >
        <div className="project-overview-row__name">
          <SkeletonBlock
            as="span"
            className="inline-block h-3.5 w-3.5 shrink-0 rounded"
          />
          <SkeletonBlock
            as="span"
            className="inline-block h-3 w-11 shrink-0 rounded"
          />
          <SkeletonBlock
            as="span"
            className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
          />
          <SkeletonBlock
            as="span"
            className={`inline-block h-3 shrink-0 rounded-md ${titleWidth}`}
          />
        </div>
        <div aria-hidden="true" />
        <div className="project-overview-row__priority">
          <SkeletonBlock
            as="span"
            className="inline-block h-3.5 w-3.5 rounded-full"
          />
        </div>
        <div className="project-overview-row__dates">
          <SkeletonBlock
            as="span"
            className="inline-block h-3 w-[4.25rem] rounded"
          />
          <span className="project-overview-row__dates-sep" aria-hidden="true">
            ›
          </span>
          <SkeletonBlock as="span" className="inline-block h-3 w-14 rounded" />
        </div>
        <div className="project-overview-row__issues flex justify-center">
          <SkeletonBlock as="span" className="inline-block h-3 w-5 rounded" />
        </div>
        <div className="project-overview-row__status">
          <SkeletonBlock as="span" className="inline-block h-3 w-9 rounded" />
          <SkeletonBlock
            as="span"
            className="inline-block h-3.5 w-3.5 rounded-full"
          />
        </div>
      </div>
    </li>
  );
}

/**
 * Projects list loading state: real status group headers with item-shaped
 * skeleton rows — matching the ready projects list layout (web + desktop).
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
            <StatusGroupSection
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
            </StatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
