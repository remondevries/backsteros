"use client";

import type { SVGProps } from "react";

export type ChevronDownIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Shared disclosure chevron for collapsible property-rail cards. */
export function ChevronDownIcon({ size = 12, ...props }: ChevronDownIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M18.53 9.53a.75.75 0 0 0 0-1.06H5.47a.75.75 0 0 0 0 1.06l6 6a.75.75 0 0 0 1.06 0z" />
    </svg>
  );
}
