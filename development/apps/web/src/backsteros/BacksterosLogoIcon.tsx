import { useId } from "react";

import { cn } from "~/lib/utils";

/** BacksterDEV mark — slow spin with a light scale pulse. */
export function BacksterosLogoIcon({
  className,
  size = 16,
}: {
  className?: string | undefined;
  size?: number;
}) {
  const id = useId();
  const paint0 = `paint0_${id}`;
  const paint1 = `paint1_${id}`;
  const paint2 = `paint2_${id}`;
  const paint3 = `paint3_${id}`;

  return (
    <span className={cn("bos-logo-icon no-drag", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 110 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="bos-logo-icon__mark"
      >
        <path
          d="M80.0985 80.3848C70.3373 90.146 53.0056 90.0614 41.3512 78.4071L30.9697 68.0256C19.3154 56.3712 19.2301 39.0389 28.9914 29.2777C38.7526 19.5164 56.0849 19.6017 67.7393 31.256L78.1208 41.6375C89.775 53.2919 89.8597 70.6236 80.0985 80.3848Z"
          stroke={`url(#${paint0})`}
          strokeWidth="15"
        />
        <path
          d="M79.4746 28.9914C89.3059 38.8226 89.2423 55.9929 77.8691 67.3664L67.6375 77.5981C56.2639 88.9716 39.0938 89.0349 29.2624 79.2036C19.4311 69.3722 19.4944 52.2021 30.8679 40.8285L41.0996 30.5969C52.4731 19.2237 69.6434 19.1601 79.4746 28.9914Z"
          stroke={`url(#${paint1})`}
          strokeWidth="15"
        />
        <path
          d="M23.335 36.7381C30.2372 24.7832 47.0002 20.3791 61.2739 28.6199L73.9885 35.9607C88.2622 44.2016 92.8304 60.9213 85.9282 72.8763C79.026 84.8313 62.2622 89.235 47.9885 80.9941L35.2739 73.6532C21.0003 65.4123 16.4328 48.6931 23.335 36.7381Z"
          stroke={`url(#${paint2})`}
          strokeWidth="15"
        />
        <path
          d="M36.828 84.7548C24.7872 77.8031 20.4046 61.2014 28.4466 47.2718L35.6814 34.7407C43.7238 20.811 60.2925 16.3059 72.3334 23.2577C84.3742 30.2095 88.757 46.811 80.7148 60.7407L73.4799 73.2718C65.4375 87.2012 48.8688 91.7065 36.828 84.7548Z"
          stroke={`url(#${paint3})`}
          strokeWidth="15"
        />
        <defs>
          <linearGradient
            id={paint0}
            x1="42.2915"
            y1="17.4833"
            x2="44.5516"
            y2="55.9325"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="currentColor" />
            <stop offset="1" stopColor="#999999" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={paint1}
            x1="92.5219"
            y1="42.6356"
            x2="53.4143"
            y2="44.4399"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="currentColor" />
            <stop offset="1" stopColor="#999999" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={paint2}
            x1="76.1338"
            y1="87.7111"
            x2="63.9994"
            y2="51.1571"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="currentColor" />
            <stop offset="1" stopColor="#999999" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={paint3}
            x1="20.6939"
            y1="74.9524"
            x2="58.0019"
            y2="63.0878"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="currentColor" />
            <stop offset="1" stopColor="#999999" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}
