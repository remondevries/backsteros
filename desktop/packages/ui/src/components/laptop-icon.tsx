import type { SVGProps } from "react";

export type LaptopIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Laptop glyph for the general entity icon picker set. */
export function LaptopIcon({ size = 16, ...props }: LaptopIconProps) {
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
        d="M2 3C2 2.73478 2.10536 2.48043 2.29289 2.29289C2.48043 2.10536 2.73478 2 3 2H13C13.2652 2 13.5196 2.10536 13.7071 2.29289C13.8946 2.48043 14 2.73478 14 3V11H2V3ZM1 12.2C1 12.09 1.09 12 1.2 12H6.293C6.42535 12 6.55229 12.0525 6.646 12.146L6.912 12.412C6.96821 12.4683 7.04446 12.4999 7.124 12.5H8.876C8.95554 12.4999 9.03179 12.4683 9.088 12.412L9.354 12.146C9.44771 12.0525 9.57465 12 9.707 12H14.8C14.91 12 15 12.09 15 12.2V13C15 13.2652 14.8946 13.5196 14.7071 13.7071C14.5196 13.8946 14.2652 14 14 14H2C1.73478 14 1.48043 13.8946 1.29289 13.7071C1.10536 13.5196 1 13.2652 1 13V12.2Z"
      />
    </svg>
  );
}
