import type { SVGProps } from "react";

export type CollapseLayoutIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Inward-corner arrows for collapsing full-page layout back to the narrow panel. */
export function CollapseLayoutIcon({
  size = 14,
  className,
  ...props
}: CollapseLayoutIconProps) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path d="M20 10h-6V4M4 14h6v6M20 4l-6 6m-4 4-6 6" />
    </svg>
  );
}
