import type { SVGProps } from "react";

export type ExpandLayoutIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Outward-corner arrows for expanding a panel to full-page layout. */
export function ExpandLayoutIcon({
  size = 14,
  className,
  ...props
}: ExpandLayoutIconProps) {
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
      <path d="M14 4h6v6M10 20H4v-6M20 4l-6 6M4 20l6-6" />
    </svg>
  );
}
