"use client";

type CircularProgressProps = {
  /** 0–1 filled ratio. Ignored when `indeterminate` is true. */
  value?: number;
  /** Spinning ring when exact progress is unknown. */
  indeterminate?: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
};

/**
 * Circular progress ring for uploads and similar determinate work.
 */
export function CircularProgress({
  value = 0,
  indeterminate = false,
  size = 28,
  strokeWidth = 2.5,
  className,
  label,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  const dashOffset = circumference * (1 - clamped);
  const percent = Math.round(clamped * 100);
  const ariaLabel =
    label ??
    (indeterminate ? "Uploading" : `Uploading ${percent}%`);

  return (
    <svg
      className={[
        "circular-progress shrink-0",
        indeterminate ? "circular-progress--indeterminate" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : percent}
    >
      <circle
        className="circular-progress-track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
      />
      <circle
        className="circular-progress-indicator"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={indeterminate ? circumference * 0.75 : dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
