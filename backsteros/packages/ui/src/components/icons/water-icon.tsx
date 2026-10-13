import type { SVGProps } from "react";

export type WaterIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Water / droplet glyph for the general entity icon picker set. */
export function WaterIcon({ size = 16, ...props }: WaterIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 43 43"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        fill="currentColor"
        d="M30.8347 17.4977C26.8488 12.2956 23.0654 8.78258 22.7277 1.89157C22.7277 1.68889 22.6602 1.55378 22.525 1.41866C22.4575 1.08086 22.1197 0.878187 21.7819 1.08086C21.3765 1.08086 21.0388 1.3511 21.0388 1.82401C12.5264 11.012 -1.86362 34.3198 16.2422 41.0081C24.4168 44.0483 33.6724 39.9272 35.2938 31.0093C36.1719 26.2128 33.6721 21.146 30.8347 17.4977ZM16.3096 36.6844C14.3504 35.5359 13.1343 33.239 12.5263 31.2121C12.2561 30.1987 12.121 29.1855 12.1885 28.1721C12.5939 26.4156 13.1343 24.7265 13.7424 23.0376C14.0802 24.5238 14.7558 26.0102 15.7016 27.091C17.8635 29.4558 22.2548 30.8744 23.4709 33.847C24.214 35.671 21.309 37.225 20.0929 37.6302C18.8093 38.0356 17.3904 37.3601 16.3096 36.6844Z"
      />
    </svg>
  );
}
