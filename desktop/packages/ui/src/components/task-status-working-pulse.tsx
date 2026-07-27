"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { iconSvgColorStyle, mergeIconSvgClassName } from "../icon-color.js";
import {
  describeTaskStatusPieWedge,
  taskStatusRingPath,
  TASK_STATUS_RING_STROKE_WIDTH,
} from "../task-status-icon-model.js";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "../task-status-color.js";

const FILL_MIN = 0.14;
const FILL_MAX = 0.9;
/** Seconds for one fill-up → shrink cycle. */
const FILL_CYCLE_S = 1.85;
/** Degrees per second for continuous rotation. */
const ROTATION_DEG_PER_S = 130;

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** 0→1→0 over a full cycle (fill up, then empty). */
function fillProgress(phase: number): number {
  const t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  return FILL_MIN + smoothstep(t) * (FILL_MAX - FILL_MIN);
}

export type TaskStatusWorkingPulseProps = {
  className?: string;
  size?: number;
  /**
   * Tighter halo / strokes for small slots (e.g. 12px activity markers)
   * so the pulse isn't clipped.
   */
  compact?: boolean;
  /** Accessible label when used as a standalone indicator. */
  "aria-label"?: string;
};

/**
 * Animated twin of the in-progress status icon — rotating pie wedge that
 * fills and empties to read as active progress / loading.
 */
export function TaskStatusWorkingPulse({
  className,
  size = 14,
  compact = false,
  "aria-label": ariaLabel = "Working",
}: TaskStatusWorkingPulseProps) {
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const color = resolveTaskStatusColor("in_progress", undefined, {
    colorScheme,
  });
  const wedgeRef = useRef<SVGPathElement>(null);
  const wedgeGroupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const phase = (elapsed % FILL_CYCLE_S) / FILL_CYCLE_S;
      const fillRatio = fillProgress(phase);
      const rotation = (elapsed * ROTATION_DEG_PER_S) % 360;

      if (wedgeRef.current) {
        wedgeRef.current.setAttribute(
          "d",
          describeTaskStatusPieWedge(fillRatio),
        );
      }
      if (wedgeGroupRef.current) {
        wedgeGroupRef.current.setAttribute(
          "transform",
          `rotate(${rotation} 7 7)`,
        );
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

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
      <g ref={wedgeGroupRef} className="task-status-working-pulse__wedge-group">
        <path
          ref={wedgeRef}
          className="task-status-working-pulse__wedge"
          d={describeTaskStatusPieWedge(FILL_MIN)}
          fill="currentColor"
        />
      </g>
      <path
        className="task-status-working-pulse__ring"
        d={taskStatusRingPath()}
        fill="none"
        stroke="currentColor"
        strokeWidth={ringStroke}
      />
    </svg>
  );
}
