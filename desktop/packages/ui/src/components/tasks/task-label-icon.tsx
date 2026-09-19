"use client";

export type TaskLabelIconProps = {
  size?: number;
};

/** Tag mark used on the task label dropdown. */
export function TaskLabelIcon({ size = 14 }: TaskLabelIconProps) {
  return (
    <svg
      width={size}
      height={size}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M4.472 4.75c-.597 0-1.293.166-1.862.519-.58.358-1.11.974-1.11 1.856v9.75c0 .882.53 1.497 1.11 1.856.57.353 1.265.519 1.862.519H14.77a2.75 2.75 0 0 0 1.92-.781l5.35-5.216a1.75 1.75 0 0 0 0-2.506l-5.35-5.216a2.75 2.75 0 0 0-1.92-.781z" />
    </svg>
  );
}

export type TaskLabelColorDotProps = {
  color?: string | null;
  size?: number;
};

/** Round color mark for one task label. */
export function TaskLabelColorDot({
  color,
  size = 10,
}: TaskLabelColorDotProps) {
  return (
    <span
      className="crm-group-color-dot"
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? "#9CA3AF",
      }}
      aria-hidden="true"
    />
  );
}
