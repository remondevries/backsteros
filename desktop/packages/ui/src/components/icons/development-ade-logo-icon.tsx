import { useId } from "react";

type DevelopmentAdeLogoIconProps = {
  className?: string;
  size?: number;
};

export function DevelopmentAdeLogoIcon({
  className,
  size = 16,
}: DevelopmentAdeLogoIconProps) {
  const id = useId();
  const clipId = `clip0_${id}`;
  const paint0 = `paint0_${id}`;
  const paint1 = `paint1_${id}`;
  const paint2 = `paint2_${id}`;
  const paint3 = `paint3_${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 84 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M16.0635 -1.99551C25.835 -11.7665 43.1726 -11.6821 54.8239 -0.0309414L65.2054 10.3505C76.8567 22.0018 76.9417 39.3401 67.1706 49.1116C57.3993 58.883 40.0603 58.7985 28.4089 47.147L18.0274 36.7655C6.3761 25.1141 6.29218 7.77585 16.0635 -1.99551Z"
          stroke={`url(#${paint0})`}
          strokeWidth="15"
        />
        <path
          d="M17.0633 35.1211C26.9048 25.28 44.081 25.3433 55.4515 36.7134L65.6831 46.9451C77.0535 58.3156 77.1166 75.4917 67.2755 85.3332C57.434 95.1747 40.2572 95.1121 28.8866 83.7416L18.655 73.5099C7.2847 62.1393 7.22187 44.9625 17.0633 35.1211Z"
          stroke={`url(#${paint1})`}
          strokeWidth="15"
        />
        <path
          d="M85.3341 16.0637C95.1051 25.8351 95.0207 43.1727 83.3696 54.824L72.9881 65.2055C61.3368 76.8568 43.9985 76.9418 34.227 67.1708C24.4556 57.3994 24.5402 40.0605 36.1916 28.409L46.5731 18.0275C58.2245 6.37622 75.5628 6.2923 85.3341 16.0637Z"
          stroke={`url(#${paint2})`}
          strokeWidth="15"
        />
        <path
          d="M48.2177 17.0634C58.0588 26.9049 57.9954 44.0811 46.6253 55.4516L36.3937 65.6832C25.0232 77.0537 7.84705 77.1168 -1.9945 67.2756C-11.836 57.4341 -11.7734 40.2573 -0.402821 28.8867L9.82882 18.6551C21.1994 7.28482 38.3763 7.222 48.2177 17.0634Z"
          stroke={`url(#${paint3})`}
          strokeWidth="15"
        />
      </g>
      <defs>
        <linearGradient
          id={paint0}
          x1="53.863"
          y1="60.9134"
          x2="51.5916"
          y2="22.4553"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={paint1}
          x1="30.7148"
          y1="22.0666"
          x2="32.5306"
          y2="61.1837"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={paint2}
          x1="22.4252"
          y1="53.8631"
          x2="60.8833"
          y2="51.5917"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={paint3}
          x1="61.2722"
          y1="30.7149"
          x2="22.1551"
          y2="32.5307"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect width="84" height="84" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
