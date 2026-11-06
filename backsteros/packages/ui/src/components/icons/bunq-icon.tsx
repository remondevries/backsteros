import { useId, type SVGProps } from "react";

export type BunqIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/**
 * bunq brand mark (striped tile + white wordmark).
 * Used as the default avatar for the Bunq Personal finance account.
 */
export function BunqIcon({ size = 16, ...props }: BunqIconProps) {
  const clipId = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 504 504"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <g clipPath={`url(#${clipId})`}>
        <rect width="42" height="515" fill="#018146" />
        <rect x="252" width="42" height="515" fill="#2973BC" />
        <rect x="126" width="42" height="515" fill="#8BCC54" />
        <rect x="378" width="42" height="515" fill="#DA1C3E" />
        <rect x="42" width="42" height="515" fill="#2E9B47" />
        <rect x="294" width="42" height="515" fill="#1B5AA4" />
        <rect x="168" width="42" height="515" fill="#3DB8AC" />
        <rect x="420" width="42" height="515" fill="#F05E27" />
        <rect x="84" width="42" height="515" fill="#63B64F" />
        <rect x="336" width="42" height="515" fill="#AE084D" />
        <rect x="210" width="42" height="515" fill="#3295D6" />
        <rect x="462" width="42" height="515" fill="#F9A32F" />
        <path
          d="M226.345 212.944H243.342V256.112C243.342 276.531 226.206 293.112 205.098 293.112C183.994 293.112 166.856 276.531 166.856 256.112V212.942H183.853V256.109C183.853 268.588 193.374 278.721 205.098 278.721C216.825 278.721 226.345 268.588 226.345 256.109V212.944ZM319.828 247.888C319.828 235.41 310.307 225.277 298.581 225.277C286.856 225.277 277.336 235.41 277.336 247.888V291.058H260.339V247.888C260.339 227.469 277.475 210.888 298.581 210.888C319.687 210.888 336.823 227.469 336.823 247.888V291.056H319.828V247.888ZM81.8717 291.056H67V254.056H67.0648C67.0208 253.371 67 252.687 67 252V178H83.9969V219.116C91.0939 213.952 99.93 210.888 109.492 210.888C132.948 210.888 151.984 229.31 151.984 252C151.984 274.69 132.948 293.112 109.492 293.112C99.3357 293.112 90.0094 289.657 82.7019 283.896L81.8717 291.056ZM108.431 225.279C93.7695 225.279 81.8717 237.251 81.8717 252C81.8717 266.749 93.7695 278.723 108.431 278.723C123.09 278.723 134.988 266.749 134.988 252C134.988 237.253 123.09 225.281 108.431 225.279ZM421.809 212.944H436.681V249.944H436.616C436.658 250.624 436.681 251.311 436.681 252V326H419.684V284.884C412.587 290.048 403.749 293.112 394.189 293.112C370.733 293.112 351.697 274.69 351.697 252C351.697 229.31 370.733 210.888 394.189 210.888C404.343 210.888 413.672 214.343 420.979 220.104L421.809 212.944ZM421.809 252C421.809 237.251 409.909 225.277 395.25 225.277C380.589 225.277 368.693 237.251 368.693 252C368.693 266.749 380.589 278.723 395.25 278.723C409.909 278.723 421.809 266.749 421.809 252Z"
          fill="white"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="504" height="504" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
