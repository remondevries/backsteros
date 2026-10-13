import type { SVGProps } from "react";

export type PhoneIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Phone glyph for the general entity icon picker set. */
export function PhoneIcon({ size = 16, ...props }: PhoneIconProps) {
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
        d="M10 2.5H10.5C10.7652 2.5 11.0196 2.60536 11.2071 2.79289C11.3946 2.98043 11.5 3.23478 11.5 3.5V12.5C11.5 12.7652 11.3946 13.0196 11.2071 13.2071C11.0196 13.3946 10.7652 13.5 10.5 13.5H5.5C5.23478 13.5 4.98043 13.3946 4.79289 13.2071C4.60536 13.0196 4.5 12.7652 4.5 12.5V3.5C4.5 3.23478 4.60536 2.98043 4.79289 2.79289C4.98043 2.60536 5.23478 2.5 5.5 2.5H6V3C6 3.26522 6.10536 3.51957 6.29289 3.70711C6.48043 3.89464 6.73478 4 7 4H9C9.26522 4 9.51957 3.89464 9.70711 3.70711C9.89464 3.51957 10 3.26522 10 3V2.5ZM3 3.5C3 2.83696 3.26339 2.20107 3.73223 1.73223C4.20107 1.26339 4.83696 1 5.5 1H10.5C11.163 1 11.7989 1.26339 12.2678 1.73223C12.7366 2.20107 13 2.83696 13 3.5V12.5C13 13.163 12.7366 13.7989 12.2678 14.2678C11.7989 14.7366 11.163 15 10.5 15H5.5C4.83696 15 4.20107 14.7366 3.73223 14.2678C3.26339 13.7989 3 13.163 3 12.5V3.5Z"
      />
    </svg>
  );
}
