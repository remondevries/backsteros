import type { SVGProps } from "react";

export type ToothIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/** Tooth / dental glyph for the general entity icon picker set. */
export function ToothIcon({ size = 16, ...props }: ToothIconProps) {
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
        d="M4.74587 1.44597C5.33428 0.936746 6.15062 0.908266 7.02318 1.23864C8.69301 1.86976 8.21907 1.929 9.913 1.25003C11.0014 0.813712 11.9985 0.935607 12.5628 1.7171C13.084 2.43708 13.0307 3.34389 12.9454 4.21767C12.8259 5.44573 12.4735 6.62595 11.8921 7.75946C12.2315 10.104 12.0799 11.9597 11.8248 13.2983C11.4623 15.2008 10.7213 15.8638 10.3237 13.3177C10.2825 13.0568 10.2624 12.7822 10.2554 12.7048C10.0978 10.8934 9.96019 9.08778 8.41989 9.09462C6.99406 9.45005 6.91374 10.628 6.80328 12.4849C6.79625 12.6034 6.77115 13.0226 6.72798 13.3188C6.35947 15.849 5.57225 15.252 5.23788 13.3188C5.03606 12.1488 4.9246 10.2543 5.00995 7.74351C4.54103 6.53026 4.17956 5.31131 4.05103 4.05248C3.9446 3.01352 3.93355 2.14886 4.74587 1.44597Z"
      />
    </svg>
  );
}
