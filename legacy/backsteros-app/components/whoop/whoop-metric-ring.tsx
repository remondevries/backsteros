"use client";

import { useEffect, useState, type CSSProperties } from "react";

import {
  WHOOP_METRIC_RING_CIRCUMFERENCE,
  whoopValueToDash,
} from "@/lib/whoop/metrics";

const RING_STROKE_WIDTH = 3;

function WhoopMetricRingCircle({
  dashLength,
  targetDashLength,
  animate,
}: {
  dashLength: number;
  targetDashLength?: number;
  animate: boolean;
}) {
  const dashOffset = WHOOP_METRIC_RING_CIRCUMFERENCE - dashLength;
  const targetOffset =
    targetDashLength != null
      ? WHOOP_METRIC_RING_CIRCUMFERENCE - targetDashLength
      : null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth={RING_STROKE_WIDTH}
        className="opacity-20"
      />
      {targetDashLength != null && targetDashLength > 0 && targetOffset != null ? (
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE_WIDTH}
          strokeDasharray={`${WHOOP_METRIC_RING_CIRCUMFERENCE} ${WHOOP_METRIC_RING_CIRCUMFERENCE}`}
          strokeDashoffset={targetOffset}
          strokeLinecap="round"
          className={`opacity-40${animate ? " transition-[stroke-dashoffset] duration-[450ms] ease-[cubic-bezier(0.33,0,0.2,1)]" : ""}`}
        />
      ) : null}
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth={RING_STROKE_WIDTH}
        strokeDasharray={`${WHOOP_METRIC_RING_CIRCUMFERENCE} ${WHOOP_METRIC_RING_CIRCUMFERENCE}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        className={animate ? "transition-[stroke-dashoffset] duration-[450ms] ease-[cubic-bezier(0.33,0,0.2,1)]" : ""}
      />
    </svg>
  );
}

type WhoopMetricRingProps = {
  label: string;
  value: number | null | undefined;
  targetValue?: number | null;
  max: number;
  ringColor: string;
  displayValue: string;
  title?: string;
  className?: string;
  valueClassName?: string;
  animateFill?: boolean;
};

export function WhoopMetricRing({
  label,
  value,
  targetValue,
  max,
  ringColor,
  displayValue,
  title,
  className,
  valueClassName,
  animateFill = true,
}: WhoopMetricRingProps) {
  const dashLength = whoopValueToDash(value, max);
  const targetDashLength =
    targetValue != null ? whoopValueToDash(targetValue, max) : undefined;
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (!animateFill) {
      return;
    }
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [value, targetValue, max, animateFill]);

  const fillAnimate = animateFill && animate;

  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-1.5${className ? ` ${className}` : ""}`}
      title={title}
    >
      <div
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center tabular-nums"
        style={{ "--whoop-metric-ring-color": ringColor, color: ringColor } as CSSProperties}
      >
        <WhoopMetricRingCircle
          dashLength={dashLength}
          targetDashLength={targetDashLength}
          animate={fillAnimate}
        />
        <span
          className={[
            "relative z-[1] text-xs font-medium leading-none text-foreground/70",
            valueClassName ?? null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {displayValue}
        </span>
      </div>
      <span className="text-center text-xs leading-tight text-foreground/50">{label}</span>
    </div>
  );
}
