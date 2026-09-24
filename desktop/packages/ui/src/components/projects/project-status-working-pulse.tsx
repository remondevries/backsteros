"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

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
 * wedge that fills and empties inside a hex ring (not the circular task pulse).
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
          describeProjectProgressPieWedge(fillRatio),
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
      <g
        ref={wedgeGroupRef}
        className="project-status-working-pulse__wedge-group"
      >
        <path
          ref={wedgeRef}
          className="project-status-working-pulse__wedge"
          d={describeProjectProgressPieWedge(FILL_MIN)}
          fill="currentColor"
        />
      </g>
      <path
        className="project-status-working-pulse__ring"
        d={describeProjectProgressHexagonPath()}
        fill="none"
        stroke="currentColor"
        strokeWidth={ringStroke}
        strokeLinejoin="round"
      />
    </svg>
  );
}
