"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle, mergeIconSvgClassName } from "@/lib/icon-color";
import type { TaskDueDateUrgency } from "@/lib/task-due-date";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "@/lib/task-status-color";

type TaskDueDateIconProps = {
  active?: boolean;
  urgency?: TaskDueDateUrgency | null;
  size?: number;
  className?: string;
};

function resolveTaskDueDateIconColor(
  active: boolean,
  urgency: TaskDueDateUrgency | null | undefined,
  colorScheme: ReturnType<typeof getPreferredColorSchemeSnapshot>,
): string | undefined {
  if (!active) {
    return undefined;
  }

  if (urgency === "due_today") {
    return resolveTaskStatusColor("on_hold", undefined, { colorScheme });
  }

  if (urgency === "due_soon") {
    return resolveTaskStatusColor("triage", undefined, { colorScheme });
  }

  return undefined;
}

export function TaskDueDateIcon({
  active = false,
  urgency = null,
  size = 14,
  className,
}: TaskDueDateIconProps) {
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const semanticColor = resolveTaskDueDateIconColor(active, urgency, colorScheme);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={mergeIconSvgClassName(className, {
        defaultClassName: active ? "shrink-0" : "shrink-0 text-foreground/45",
      })}
      style={iconSvgColorStyle(semanticColor)}
    >
      <path
        d="M11 1C13.2091 1 15 2.79086 15 5V11C15 13.2091 13.2091 15 11 15H5C2.79086 15 1 13.2091 1 11V5C1 2.79086 2.79086 1 5 1H11ZM13.5 6H2.5V11C2.5 12.3807 3.61929 13.5 5 13.5H11C12.3807 13.5 13.5 12.3807 13.5 11V6Z"
        fill="currentColor"
      />
    </svg>
  );
}
