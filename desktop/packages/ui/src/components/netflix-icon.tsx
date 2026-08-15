import type { SVGProps } from "react";

export type NetflixIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Netflix brand mark for the entity icon picker Brand group. */
export function NetflixIcon({ size = 16, ...props }: NetflixIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 31 31"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M7 1L7.10405 30C9.30905 29.5923 11.043 29.6369 13 29.4673V1.0333L7 1Z"
        fill="currentColor"
      />
      <path
        d="M17.5341 1H23.4318L23.5 30L17.5 29.0311L17.5341 1Z"
        fill="currentColor"
      />
      <path
        d="M7.5 1C7.63389 1.33449 17.5418 29.4983 17.5418 29.4983C19.1699 29.4867 21.3529 29.7523 23.5 30L13.1904 1H7.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
