import type { SVGProps } from "react";

export type Office365IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Microsoft / Office 365 four-square mark for Brand icons + email category. */
export function Office365Icon({ size = 16, ...props }: Office365IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path fill="#F1511B" d="M121.666 121.666H0V0h121.666z" />
      <path fill="#80CC28" d="M256 121.666H134.335V0H256z" />
      <path fill="#00ADEF" d="M121.663 256.002H0V134.336h121.663z" />
      <path fill="#FBBC09" d="M256 256.002H134.335V134.336H256z" />
    </svg>
  );
}
