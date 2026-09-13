import type { CSSProperties } from "react";

/** Shared path for the only calendar glyph (due dates, Agenda nav, Spaces freshness). */
export const CALENDAR_ICON_PATH =
  "M11 1C13.2091 1 15 2.79086 15 5V11C15 13.2091 13.2091 15 11 15H5C2.79086 15 1 13.2091 1 11V5C1 2.79086 2.79086 1 5 1H11ZM13.5 6H2.5V11C2.5 12.3807 3.61929 13.5 5 13.5H11C12.3807 13.5 13.5 12.3807 13.5 11V6Z";

export type CalendarIconProps = {
  size?: number | "small" | "medium" | "large";
  className?: string;
  style?: CSSProperties;
  title?: string;
};

function resolveCalendarIconSize(
  size: CalendarIconProps["size"],
): number {
  if (typeof size === "number") return size;
  if (size === "medium") return 24;
  if (size === "large") return 32;
  return 16;
}

/**
 * Canonical calendar mark — same glyph as due dates and Agenda.
 * Do not use Primer’s calendar/agenda octicon elsewhere.
 */
export function CalendarIcon({
  size = 16,
  className,
  style,
  title,
}: CalendarIconProps) {
  const px = resolveCalendarIconSize(size);
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      style={style}
    >
      <path d={CALENDAR_ICON_PATH} fill="currentColor" />
    </svg>
  );
}
