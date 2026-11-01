"use client";

import type { SVGProps } from "react";

export type AlertCircleExclamationIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Filled circle with ! — needs-attention affordance. */
export function AlertCircleExclamationIcon({
  size = 14,
  "aria-label": ariaLabel,
  ...props
}: AlertCircleExclamationIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
      focusable="false"
      {...props}
    >
      <path
        d="M7 14C10.866 14 14 10.866 14 7C14 3.13401 10.866 0 7 0C3.13401 0 0 3.13401 0 7C0 10.866 3.13401 14 7 14ZM7.7 2.85C7.7 2.4634 7.3866 2.15 7 2.15C6.6134 2.15 6.3 2.4634 6.3 2.85V7.65C6.3 8.0366 6.6134 8.35 7 8.35C7.3866 8.35 7.7 8.0366 7.7 7.65V2.85ZM7 11.35C7.44183 11.35 7.8 10.9918 7.8 10.55C7.8 10.1082 7.44183 9.75 7 9.75C6.55817 9.75 6.2 10.1082 6.2 10.55C6.2 10.9918 6.55817 11.35 7 11.35Z"
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
      />
    </svg>
  );
}
