"use client";

import { useId } from "react";

type AdminLogoIconProps = {
  className?: string;
  size?: number;
};

/** BacksterOS mark — same geometry as product `ProfileLogoIcon`. */
export function AdminLogoIcon({ className, size = 16 }: AdminLogoIconProps) {
  const id = useId();
  const width = Math.round((size * 35) / 29);

  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 35 29"
      fill="none"
      aria-hidden="true"
      className={className}
      data-logo={id}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.5 0L35 29H18.6667V13.92H16.3333V29H1.04308e-06L17.5 0Z"
        fill="#F8FAFC"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M35 0V19.72L23.3333 0H35Z"
        fill="#F8FAFC"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 0V19.72L11.6667 0H0Z"
        fill="#F8FAFC"
      />
    </svg>
  );
}
