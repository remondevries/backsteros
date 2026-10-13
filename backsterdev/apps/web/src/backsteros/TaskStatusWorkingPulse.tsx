import { useEffect, useRef, useSyncExternalStore } from "react";

import { cn } from "~/lib/utils";

import {
  describeBacksterosTaskStatusPieWedge,
  getBacksterosTaskStatusColor,
  subscribeBacksterosColorScheme,
  getBacksterosColorSchemeSnapshot,
  backsterosTaskStatusRingPath,
  BACKSTEROS_TASK_STATUS_RING_STROKE_WIDTH,
} from "./taskStatusIconGeometry";

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
 * fills and empties to read as active agent work (matches BacksterOS desktop).
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
        wedgeRef.current.setAttribute("d", describeBacksterosTaskStatusPieWedge(fillRatio));
      }
      if (wedgeGroupRef.current) {
        wedgeGroupRef.current.setAttribute("transform", `rotate(${rotation} 7 7)`);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

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
      <g ref={wedgeGroupRef} className="bos-task-status-working-pulse__wedge-group">
        <path
          ref={wedgeRef}
          className="bos-task-status-working-pulse__wedge"
          d={describeBacksterosTaskStatusPieWedge(FILL_MIN)}
          fill="currentColor"
        />
      </g>
      <path
        className="bos-task-status-working-pulse__ring"
        d={backsterosTaskStatusRingPath()}
        fill="none"
        stroke="currentColor"
        strokeWidth={ringStroke}
      />
    </svg>
  );
}
