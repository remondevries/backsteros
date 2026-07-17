"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle } from "@/lib/icon-color";
import {
  computeProjectTaskProgressRatio,
  formatProjectTaskProgressLabel,
  type ProjectTaskProgress,
} from "@/lib/project-task-progress";
import {
  describeProjectProgressHexagonPath,
  describeProjectProgressPieWedge,
  PROJECT_PROGRESS_HEX_STROKE_WIDTH,
} from "@/lib/project-progress-ring";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "@/lib/task-status-color";

type ProjectProgressRingProps = {
  progress: ProjectTaskProgress;
  size?: number;
  title?: string;
  className?: string;
};

export function ProjectProgressRing({
  progress,
  size = 14,
  title,
  className,
}: ProjectProgressRingProps) {
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const completedColor = resolveTaskStatusColor("completed", undefined, {
    colorScheme,
  });
  const fillRatio = computeProjectTaskProgressRatio(
    progress.completed,
    progress.total,
  );
  const wedgePath = describeProjectProgressPieWedge(fillRatio);
  const hexOutlinePath = describeProjectProgressHexagonPath();
  const label = title ?? formatProjectTaskProgressLabel(progress);
  const hasTasks = progress.total > 0;

  return (
    <svg
      className={
        className ?? (hasTasks ? "shrink-0" : "shrink-0 text-foreground/25")
      }
      style={hasTasks ? iconSvgColorStyle(completedColor) : undefined}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-hidden={title ? undefined : true}
      aria-label={title ? undefined : label}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g fill="none">
        {hasTasks && wedgePath ? (
          <path d={wedgePath} fill="currentColor" />
        ) : null}
        <path
          d={hexOutlinePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={PROJECT_PROGRESS_HEX_STROKE_WIDTH}
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
