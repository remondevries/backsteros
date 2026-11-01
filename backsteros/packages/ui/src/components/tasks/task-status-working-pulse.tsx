"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle, mergeIconSvgClassName } from "../../entity/icon-color.js";
import {
  describeTaskStatusPieWedge,
  taskStatusRingPath,
  TASK_STATUS_RING_STROKE_WIDTH,
} from "../../tasks/task-status-icon-model.js";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";

/** Steady mid-fill — CSS spins this; avoid per-frame path morphing on the main thread. */
const WEDGE_FILL = 0.55;
const WEDGE_PATH = describeTaskStatusPieWedge(WEDGE_FILL);
const RING_PATH = taskStatusRingPath();

export type TaskStatusWorkingPulseProps = {
  className?: string;
  size?: number;
  /**
   * Tighter halo / strokes for small slots (e.g. 12px activity markers)
   * so the pulse isn't clipped.
   */
  compact?: boolean;
  /**
   * Override paint color (e.g. Ready to Start white while still animating).
   * Defaults to the in-progress status color.
   */
  color?: string;
  /** Accessible label when used as a standalone indicator. */
  "aria-label"?: string;
};

/**
 * Animated twin of the in-progress status icon — rotating pie wedge that
 * reads as active progress / loading. Motion is CSS-only so list/channel
 * pulses do not pin the main thread with requestAnimationFrame.
 */
export function TaskStatusWorkingPulse({
  className,
  size = 14,
  compact = false,
  color: colorOverride,
  "aria-label": ariaLabel = "Working",
}: TaskStatusWorkingPulseProps) {
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const color =
    colorOverride ??
    resolveTaskStatusColor("in_progress", undefined, {
      colorScheme,
    });

  const haloRadius = compact ? 5.35 : 6;
  const haloStroke = compact ? 1 : 1.25;
  const ringStroke = compact
    ? Math.max(1, TASK_STATUS_RING_STROKE_WIDTH - 0.15)
    : TASK_STATUS_RING_STROKE_WIDTH;

  return (
    <svg
      className={mergeIconSvgClassName(
        [
          "task-status-working-pulse",
          compact ? "task-status-working-pulse--compact" : null,
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
      <circle
        className="task-status-working-pulse__halo"
        cx="7"
        cy="7"
        r={haloRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={haloStroke}
      />
      <g className="task-status-working-pulse__wedge-group">
        <path
          className="task-status-working-pulse__wedge"
          d={WEDGE_PATH}
          fill="currentColor"
        />
      </g>
      <path
        className="task-status-working-pulse__ring"
        d={RING_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={ringStroke}
      />
    </svg>
  );
}
