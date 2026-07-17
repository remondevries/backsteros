"use client";

import { useSyncExternalStore } from "react";

import {
  iconSvgColorStyle,
  mergeIconSvgClassName,
} from "@/lib/icon-color";
import {
  getTaskPriorityActiveBars,
  getTaskPriorityLabel,
  isTaskPriorityNone,
  isTaskPriorityUrgent,
} from "@/lib/task-priority";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "@/lib/task-status-color";

const BAR_HEIGHTS = [5, 8, 11] as const;

const URGENT_PRIORITY_PATH =
  "M3 1C1.91067 1 1 1.91067 1 3V13C1 14.0893 1.91067 15 3 15H13C14.0893 15 15 14.0893 15 13V3C15 1.91067 14.0893 1 13 1H3ZM7 4H9L8.75391 8.99836H7.25L7 4ZM9 11C9 11.5523 8.55228 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55228 10 9 10.4477 9 11Z";

const NO_PRIORITY_PATHS = [
  "M4 7.25H2C1.72386 7.25 1.5 7.47386 1.5 7.75V8.25C1.5 8.52614 1.72386 8.75 2 8.75H4C4.27614 8.75 4.5 8.52614 4.5 8.25V7.75C4.5 7.47386 4.27614 7.25 4 7.25Z",
  "M9 7.25H7C6.72386 7.25 6.5 7.47386 6.5 7.75V8.25C6.5 8.52614 6.72386 8.75 7 8.75H9C9.27614 8.75 9.5 8.52614 9.5 8.25V7.75C9.5 7.47386 9.27614 7.25 9 7.25Z",
  "M14 7.25H12C11.7239 7.25 11.5 7.47386 11.5 7.75V8.25C11.5 8.52614 11.7239 8.75 12 8.75H14C14.2761 8.75 14.5 8.52614 14.5 8.25V7.75C14.5 7.47386 14.2761 7.25 14 7.25Z",
] as const;

type TaskPriorityIconProps = {
  priority?: number;
  title?: string;
  className?: string;
  size?: number;
  highlighted?: boolean;
};

export function TaskPriorityIcon({
  priority,
  title,
  className,
  size = 14,
  highlighted = false,
}: TaskPriorityIconProps) {
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const label = title ?? getTaskPriorityLabel(priority);

  if (isTaskPriorityUrgent(priority)) {
    const urgentColor = highlighted
      ? undefined
      : resolveTaskStatusColor("triage", undefined, { colorScheme });

    return (
      <svg
        className={mergeIconSvgClassName(className, { highlighted })}
        style={iconSvgColorStyle(urgentColor)}
        viewBox="0 0 16 16"
        width={size}
        height={size}
        aria-label={label}
        role="img"
      >
        <title>{label}</title>
        <path d={URGENT_PRIORITY_PATH} fill="currentColor" />
      </svg>
    );
  }

  if (isTaskPriorityNone(priority)) {
    return (
      <svg
        className={mergeIconSvgClassName(className, {
          highlighted,
          defaultClassName: "shrink-0 text-foreground/45",
        })}
        viewBox="0 0 16 16"
        width={size}
        height={size}
        aria-label={label}
        role="img"
      >
        <title>{label}</title>
        {NO_PRIORITY_PATHS.map((path) => (
          <path
            key={path}
            d={path}
            fill="currentColor"
            fillOpacity={highlighted ? 1 : 0.9}
          />
        ))}
      </svg>
    );
  }

  const activeBars = getTaskPriorityActiveBars(priority);

  return (
    <svg
      className={mergeIconSvgClassName(className, {
        highlighted,
        defaultClassName: "shrink-0 text-foreground/55",
      })}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-label={label}
      role="img"
    >
      <title>{label}</title>
      {BAR_HEIGHTS.map((height, index) => {
        const filled = index < activeBars;
        const x = 1 + index * 4;
        const y = 13 - height;
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width="2.5"
            height={height}
            rx="0.75"
            fill="currentColor"
            fillOpacity={highlighted ? 1 : filled ? 0.65 : 0.28}
          />
        );
      })}
    </svg>
  );
}
