import type { SVGProps } from "react";

export type FlameIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Flame glyph for the general entity icon picker set. */
export function FlameIcon({ size = 16, ...props }: FlameIconProps) {
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
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.194 1.22011C6.361 0.600109 5.212 1.38611 5.498 2.38211C5.788 3.39211 5.618 4.47911 5.031 5.35411L3.857 7.10511C3.2984 7.93839 3.0001 8.91892 3 9.92211V10.0271C3 12.7741 5.239 15.0001 8 15.0001C10.761 15.0001 13 12.7741 13 10.0271V7.11111C13 6.26711 12.011 5.80711 11.36 6.34611L10 7.47311V5.55211C9.99923 4.85647 9.83611 4.17062 9.52362 3.54912C9.21113 2.92761 8.75791 2.38762 8.2 1.97211L7.194 1.22011ZM8 14.0001C6.75 14.0001 5.5 13.5641 5.5 11.8181C5.5 10.4531 6.52 9.11011 7.362 8.41611C7.64 8.18611 8 8.40311 8 8.76411V10.5091C8.00004 10.5921 8.02075 10.6738 8.06024 10.7468C8.09974 10.8198 8.15679 10.8818 8.22625 10.9273C8.2957 10.9727 8.37538 11.0001 8.45808 11.0071C8.54079 11.014 8.62393 11.0003 8.7 10.9671L9.8 10.4871C10.13 10.3431 10.504 10.5851 10.483 10.9451C10.411 12.2051 10.028 14.0001 8 14.0001Z"
      />
    </svg>
  );
}
