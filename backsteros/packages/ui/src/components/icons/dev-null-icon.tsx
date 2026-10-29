import type { SVGProps } from "react";

export type DevNullIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Dev-null platform mark — void / circle-slash. */
export function DevNullIcon({ size = 16, ...props }: DevNullIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      fill="none"
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="5.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4 12 L12 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
