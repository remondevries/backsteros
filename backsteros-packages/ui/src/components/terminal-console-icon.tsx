"use client";

import { useId, type SVGProps } from "react";

export type TerminalConsoleIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/**
 * Filled terminal mark used by the Development console header and as the
 * shared `terminal` project icon / Codebase type glyph.
 */
export function TerminalConsoleIcon({
  size = 16,
  ...props
}: TerminalConsoleIconProps) {
  const maskId = `tc-${useId().replace(/:/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="white" />
        <path
          d="M4 12L7 9L4 6"
          stroke="black"
          strokeWidth="1.33333"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M9 12.5H12C12.4142 12.5 12.75 12.1642 12.75 11.75C12.75 11.3358 12.4142 11 12 11H9C8.58579 11 8.25 11.3358 8.25 11.75C8.25 12.1642 8.58579 12.5 9 12.5Z"
          fill="black"
        />
      </mask>
      <path
        d="M11 1C13.2091 1 15 2.79086 15 5V11C15 13.2091 13.2091 15 11 15H5C2.79086 15 1 13.2091 1 11V5C1 2.79086 2.79086 1 5 1H11Z"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
