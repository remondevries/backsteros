import { useSyncExternalStore } from "react";

import { cn } from "~/lib/utils";

import {
  describeBacksterosTaskStatusPieWedge,
  getBacksterosTaskStatusColor,
  subscribeBacksterosColorScheme,
  getBacksterosColorSchemeSnapshot,
  backsterosTaskStatusRingPath,
  BACKSTEROS_TASK_STATUS_RING_STROKE_WIDTH,
} from "./taskStatusIconGeometry";

/** Steady mid-fill — CSS spins this; avoid per-frame path morphing on the main thread. */
const WEDGE_FILL = 0.55;
const WEDGE_PATH = describeBacksterosTaskStatusPieWedge(WEDGE_FILL);
const RING_PATH = backsterosTaskStatusRingPath();

export type BacksterosTaskStatusWorkingPulseProps = {
  readonly className?: string | undefined;
  readonly size?: number;
  /**
   * Tighter halo / strokes for small slots (e.g. 12px activity markers)
   * so the pulse isn't clipped.
   */
  readonly compact?: boolean | undefined;
  /** Accessible label when used as a standalone indicator. */
  readonly "aria-label"?: string;
};

/**
 * Animated twin of the in-progress status icon — rotating pie wedge that
 * reads as active agent work (matches BacksterOS desktop). CSS-only so
 * list pulses do not pin the main thread with requestAnimationFrame.
 */
export function BacksterosTaskStatusWorkingPulse({
  className,
  size = 14,
  compact = false,
  "aria-label": ariaLabel = "Agent working",
}: BacksterosTaskStatusWorkingPulseProps) {
  const colorScheme = useSyncExternalStore(
    subscribeBacksterosColorScheme,
    getBacksterosColorSchemeSnapshot,
    () => "dark" as const,
  );
  const color = getBacksterosTaskStatusColor("in_progress", colorScheme);

  const haloRadius = compact ? 5.35 : 6;
  const haloStroke = compact ? 1 : 1.25;
  const ringStroke = compact
    ? Math.max(1, BACKSTEROS_TASK_STATUS_RING_STROKE_WIDTH - 0.15)
    : BACKSTEROS_TASK_STATUS_RING_STROKE_WIDTH;

  return (
    <svg
      className={cn(
        "bos-task-status-working-pulse",
        compact && "bos-task-status-working-pulse--compact",
        className,
      )}
      style={{ color }}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
      overflow="visible"
    >
      <circle
        className="bos-task-status-working-pulse__halo"
        cx="7"
        cy="7"
        r={haloRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={haloStroke}
      />
      <g className="bos-task-status-working-pulse__wedge-group">
        <path
          className="bos-task-status-working-pulse__wedge"
          d={WEDGE_PATH}
          fill="currentColor"
        />
      </g>
      <path
        className="bos-task-status-working-pulse__ring"
        d={RING_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={ringStroke}
      />
    </svg>
  );
}
