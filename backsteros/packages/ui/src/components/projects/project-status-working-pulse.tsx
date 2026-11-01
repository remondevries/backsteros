"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle, mergeIconSvgClassName } from "../../entity/icon-color.js";
import {
  describeProjectProgressHexagonPath,
  describeProjectProgressPieWedge,
  PROJECT_PROGRESS_HEX_STROKE_WIDTH,
} from "../../projects/project-progress-ring.js";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { TASK_STATUS_RING_RADIUS } from "../../tasks/task-status-icon-model.js";

/** Steady mid-fill — CSS spins this; avoid per-frame path morphing on the main thread. */
const WEDGE_FILL = 0.55;
const WEDGE_PATH = describeProjectProgressPieWedge(WEDGE_FILL);
const RING_PATH = describeProjectProgressHexagonPath();

export type ProjectStatusWorkingPulseProps = {
  className?: string;
  size?: number;
  /**
   * Tighter halo / strokes for small slots so the pulse isn't clipped.
   */
  compact?: boolean;
  /** Accessible label when used as a standalone indicator. */
  "aria-label"?: string;
};

/**
 * Animated twin of the in-progress project status hexagon — rotating pie
 * wedge inside a hex ring. Motion is CSS-only so pulses do not pin the
 * main thread with requestAnimationFrame.
 */
export function ProjectStatusWorkingPulse({
  className,
  size = 14,
  compact = false,
  "aria-label": ariaLabel = "Working",
}: ProjectStatusWorkingPulseProps) {
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const color = resolveTaskStatusColor("in_progress", undefined, {
    colorScheme,
  });

  const haloRadius = compact
    ? TASK_STATUS_RING_RADIUS + 0.35
    : TASK_STATUS_RING_RADIUS + 1;
  const haloStroke = compact ? 1 : 1.25;
  const ringStroke = compact
    ? Math.max(1, PROJECT_PROGRESS_HEX_STROKE_WIDTH - 0.15)
    : PROJECT_PROGRESS_HEX_STROKE_WIDTH;

  return (
    <svg
      className={mergeIconSvgClassName(
        [
          "project-status-working-pulse",
          compact ? "project-status-working-pulse--compact" : null,
          className,
        ]
          .filter(Boolean)
          .join(" "),
      )}
      style={iconSvgColorStyle(color)}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
      overflow="visible"
    >
      <path
        className="project-status-working-pulse__halo"
        d={describeProjectProgressHexagonPath(haloRadius)}
        fill="none"
        stroke="currentColor"
        strokeWidth={haloStroke}
        strokeLinejoin="round"
      />
      <g className="project-status-working-pulse__wedge-group">
        <path
          className="project-status-working-pulse__wedge"
          d={WEDGE_PATH}
          fill="currentColor"
        />
      </g>
      <path
        className="project-status-working-pulse__ring"
        d={RING_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={ringStroke}
        strokeLinejoin="round"
      />
    </svg>
  );
}
