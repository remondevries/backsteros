import { useId } from "react";

type ProfileLogoIconProps = {
  className?: string;
  /** Rendered width/height in px (square). Default 16. */
  size?: number;
  /** Alias for `size` (older callers). */
  height?: number;
};

export function ProfileLogoIcon({
  className,
  size,
  height,
}: ProfileLogoIconProps) {
  const resolvedSize = size ?? height ?? 16;
  const id = useId();
  const clipId = `clip0_${id}`;
  const stroke0 = `stroke0_${id}`;
  const stroke1 = `stroke1_${id}`;
  const stroke2 = `stroke2_${id}`;
  const stroke3 = `stroke3_${id}`;
  const paint0 = `paint0_${id}`;
  const paint1 = `paint1_${id}`;
  const paint2 = `paint2_${id}`;
  const paint3 = `paint3_${id}`;

  return (
    <svg
      width={resolvedSize}
      height={resolvedSize}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <g clipPath={`url(#${clipId})`}>
        <mask id={stroke0} fill="white">
          <path d="M14.3596 10.6309C11.6577 13.3328 7.09539 13.1513 4.1695 10.2254L2.02656 8.08247C-0.899332 5.15658 -1.08087 0.594293 1.6211 -2.10767C4.32306 -4.80964 8.88535 -4.6281 11.8112 -1.70221L13.9542 0.440727C16.8801 3.36662 17.0616 7.92891 14.3596 10.6309Z" />
        </mask>
        <path
          d="M13.9542 0.440727L11.8112 -1.70221C8.88535 -4.6281 4.32306 -4.80964 1.6211 -2.10767C-1.08087 0.594293 -0.899332 5.15658 2.02656 8.08247L4.1695 10.2254C7.09539 13.1513 11.6577 13.3328 14.3596 10.6309C17.0616 7.92891 16.8801 3.36662 13.9542 0.440727Z"
          strokeWidth="5"
          stroke={`url(#${paint0})`}
          mask={`url(#${stroke0})`}
        />
        <mask id={stroke1} fill="white">
          <path d="M1.82618 5.5537C4.52814 2.85174 9.05605 2.9989 11.9395 5.88239L14.0514 7.99427C16.9349 10.8778 17.0821 15.4057 14.3801 18.1076C11.6781 20.8096 7.15023 20.6624 4.26674 17.7789L2.15486 15.6671C-0.72863 12.7836 -0.875787 8.25567 1.82618 5.5537Z" />
        </mask>
        <path
          d="M2.15486 15.6671L4.26674 17.7789C7.15023 20.6624 11.6781 20.8096 14.3801 18.1076C17.0821 15.4057 16.9349 10.8778 14.0514 7.99427L11.9395 5.88239C9.05605 2.9989 4.52814 2.85174 1.82618 5.55371C-0.875787 8.25567 -0.72863 12.7836 2.15486 15.6671Z"
          strokeWidth="5"
          stroke={`url(#${paint1})`}
          mask={`url(#${stroke1})`}
        />
        <mask id={stroke2} fill="white">
          <path d="M5.36962 14.3582C2.66765 11.6562 2.84919 7.09393 5.77508 4.16803L7.91801 2.0251C10.8439 -0.900797 15.4062 -1.08233 18.1082 1.61963C20.8101 4.3216 20.6286 8.88388 17.7027 11.8098L15.5598 13.9527C12.6339 16.8786 8.07158 17.0601 5.36962 14.3582Z" />
        </mask>
        <path
          d="M15.5598 13.9527L17.7027 11.8098C20.6286 8.88388 20.8101 4.3216 18.1082 1.61963C15.4062 -1.08233 10.8439 -0.900797 7.91801 2.0251L5.77508 4.16803C2.84919 7.09393 2.66765 11.6562 5.36962 14.3582C8.07158 17.0601 12.6339 16.8786 15.5598 13.9527Z"
          strokeWidth="5"
          stroke={`url(#${paint2})`}
          mask={`url(#${stroke2})`}
        />
        <mask id={stroke3} fill="white">
          <path d="M10.4465 1.82618C13.1485 4.52814 13.0013 9.05605 10.1179 11.9395L8.00597 14.0514C5.12248 16.9349 0.594575 17.0821 -2.10739 14.3801C-4.80935 11.6781 -4.6622 7.15023 -1.7787 4.26674L0.333175 2.15486C3.21667 -0.72863 7.74457 -0.875787 10.4465 1.82618Z" />
        </mask>
        <path
          d="M0.333175 2.15486L-1.7787 4.26674C-4.6622 7.15023 -4.80935 11.6781 -2.10739 14.3801C0.594575 17.0821 5.12248 16.9349 8.00597 14.0514L10.1179 11.9395C13.0013 9.05605 13.1485 4.52814 10.4465 1.82618C7.74457 -0.875787 3.21667 -0.72863 0.333175 2.15486Z"
          strokeWidth="5"
          stroke={`url(#${paint3})`}
          mask={`url(#${stroke3})`}
        />
      </g>
      <defs>
        <linearGradient
          id={paint0}
          x1="10.5182"
          y1="11.9722"
          x2="10.0493"
          y2="4.03393"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={paint1}
          x1="5.73879"
          y1="3.95368"
          x2="6.1136"
          y2="12.028"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={paint2}
          x1="4.02825"
          y1="10.5167"
          x2="11.9666"
          y2="10.0479"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={paint3}
          x1="12.0466"
          y1="5.73879"
          x2="3.97223"
          y2="6.1136"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
