import type { SVGProps } from "react";

export type TrackedTimeIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Stopwatch glyph for tracked-time stamps (calendar Timetracking rows). */
export function TrackedTimeIcon({ size = 12, ...props }: TrackedTimeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M3 5.231 6.15 3M21 5.231 17.85 3M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0" />
      <path d="M12 8.5v5l3 2" />
    </svg>
  );
}
