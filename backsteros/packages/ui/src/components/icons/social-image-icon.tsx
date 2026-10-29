import type { SVGProps } from "react";

export type SocialImageIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Image / photo attachment mark for caption-less social posts. */
export function SocialImageIcon({ size = 16, ...props }: SocialImageIconProps) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <circle cx="9" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3.5 15.5 8 12l3.5 2.5L15 11l5.5 4.5" />
    </svg>
  );
}
