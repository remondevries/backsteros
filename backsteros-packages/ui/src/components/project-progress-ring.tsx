"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle } from "../icon-color.js";
import {
  computeProjectTaskProgressRatio,
  describeProjectProgressHexagonPath,
  describeProjectProgressPieWedge,
  formatProjectTaskProgressLabel,
  PROJECT_PROGRESS_HEX_STROKE_WIDTH,
  type ProjectTaskProgress,
} from "../project-progress-ring.js";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "../task-status-color.js";

export type ProjectProgressRingProps = {
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
      className={className ?? (hasTasks ? undefined : "bos-icon-faint")}
      style={hasTasks ? iconSvgColorStyle(completedColor) : undefined}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-label={label}
      role="img"
    >
      <title>{label}</title>
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
