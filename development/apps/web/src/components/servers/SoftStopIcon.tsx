import type { SVGProps } from "react";

import { cn } from "../../lib/utils";

/** Soft-rounded stop glyph for local runtime start/stop controls. */
export function SoftStopIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-3.5", className)}
      {...props}
    >
      <path d="M11.945 5.75c-1.367 0-2.47 0-3.337.117-.9.12-1.658.38-2.26.981-.602.602-.86 1.36-.981 2.26-.117.867-.117 1.97-.117 3.337v.11c0 1.367 0 2.47.117 3.337.12.9.38 1.658.981 2.26.602.602 1.36.86 2.26.982.867.116 1.97.116 3.337.116h.11c1.367 0 2.47 0 3.337-.116.9-.122 1.658-.38 2.26-.982s.86-1.36.982-2.26c.116-.867.116-1.97.116-3.337v-.11c0-1.367 0-2.47-.116-3.337-.122-.9-.38-1.658-.982-2.26s-1.36-.86-2.26-.981c-.867-.117-1.97-.117-3.337-.117z" />
    </svg>
  );
}

/** Soft play glyph for local runtime start controls. */
export function SoftStartIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-3.5", className)}
      {...props}
    >
      <path d="m12.503 7.01-.066-.04c-.748-.455-1.406-.856-1.97-1.058a2.4 2.4 0 0 0-.976-.157 1.8 1.8 0 0 0-.963.37c-.579.434-.829 1.073-.966 1.78-.133.685-.184 1.577-.247 2.663l-.003.056c-.038.65-.062 1.293-.062 1.876s.024 1.227.062 1.877l.003.055c.063 1.086.114 1.978.247 2.662.137.708.387 1.346.966 1.781.286.215.607.343.963.37.342.025.67-.047.976-.157.564-.202 1.222-.603 1.97-1.057l.066-.04c.426-.26.844-.527 1.217-.79a24 24 0 0 0 1.335-1.022l.05-.041c.764-.623 1.412-1.152 1.86-1.672.488-.57.785-1.182.785-1.966s-.297-1.397-.786-1.966c-.447-.52-1.095-1.05-1.858-1.672l-.05-.041c-.454-.37-.91-.724-1.336-1.022a23 23 0 0 0-1.217-.79" />
    </svg>
  );
}

/**
 * Spinner used while a start (or stop) action is in flight.
 * Always rotates — deliberately ignores prefers-reduced-motion.
 */
export function SoftStartingIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  const { style, ...rest } = props;
  return (
    <svg
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-3.5", className)}
      style={{
        animation: "soft-runtime-spin 0.75s linear infinite",
        ...style,
      }}
      {...rest}
    >
      <path d="M12 2.25a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75M7.125 3.556a.75.75 0 0 1 1.025.275l1.5 2.598a.75.75 0 1 1-1.3.75L6.85 4.58a.75.75 0 0 1 .275-1.025m-3.569 3.57a.75.75 0 0 1 1.025-.275l2.598 1.5a.75.75 0 0 1-.75 1.3L3.83 8.15a.75.75 0 0 1-.275-1.025M2.25 12a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75m15 0a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75m-9.797 2.625a.75.75 0 0 1-.274 1.024l-2.598 1.5a.75.75 0 0 1-.75-1.299l2.598-1.5a.75.75 0 0 1 1.024.275m9.094 0a.75.75 0 0 1 1.024-.275l2.598 1.5a.75.75 0 1 1-.75 1.3l-2.598-1.5a.75.75 0 0 1-.274-1.025m-1.922 1.922a.75.75 0 0 1 1.024.274l1.5 2.598a.75.75 0 0 1-1.299.75l-1.5-2.598a.75.75 0 0 1 .275-1.024m-5.25 0a.75.75 0 0 1 .275 1.024l-1.5 2.598a.75.75 0 0 1-1.3-.75l1.5-2.598a.75.75 0 0 1 1.025-.274M12 17.25a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 .75-.75" />
    </svg>
  );
}
