import type { SVGProps } from "react";

export type ProtonIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/**
 * Proton brand mark — circle is `currentColor` (paint / theme), letter is
 * white. Category chips pass Proton purple via entity-icon color JSON.
 */
export function ProtonIcon({ size = 16, ...props }: ProtonIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="512" cy="512" r="512" fill="currentColor" />
      <path
        fill="#fff"
        d="M353.63 634.51v133.36h93.52V640.33A46.88 46.88 0 0 1 494 593.52h95.8a168.83 168.83 0 0 0 0-337.66H353.64v166.65h93.52V344h136.26a79.89 79.89 0 0 1 0 159.78h-99A131.31 131.31 0 0 0 391.91 542a131.31 131.31 0 0 0-38.28 92.48Z"
      />
    </svg>
  );
}
