"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle, mergeIconSvgClassName } from "../../entity/icon-color.js";
import type { TaskDueDateUrgency } from "../../tasks/task-due-date.js";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { CalendarIcon } from "../icons/calendar-icon.js";

export type TaskDueDateIconProps = {
  active?: boolean;
  urgency?: TaskDueDateUrgency | null;
  size?: number;
  className?: string;
};

/** Same semantic color as the due-date icon (past due → on_hold red). */
export function resolveTaskDueDateUrgencyColor(
  urgency: TaskDueDateUrgency | null | undefined,
  colorScheme: ReturnType<typeof getPreferredColorSchemeSnapshot>,
): string | undefined {
  if (urgency === "overdue" || urgency === "due_today") {
    return resolveTaskStatusColor("on_hold", undefined, { colorScheme });
  }

  if (urgency === "due_soon") {
    return resolveTaskStatusColor("triage", undefined, { colorScheme });
  }

  return undefined;
}

function resolveTaskDueDateIconColor(
  active: boolean,
  urgency: TaskDueDateUrgency | null | undefined,
  colorScheme: ReturnType<typeof getPreferredColorSchemeSnapshot>,
): string | undefined {
  if (!active) {
    return undefined;
  }

  return resolveTaskDueDateUrgencyColor(urgency, colorScheme);
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
  const semanticColor = resolveTaskDueDateIconColor(
    active,
    urgency,
    colorScheme,
  );

  return (
    <CalendarIcon
      size={size}
      className={mergeIconSvgClassName(className, {
        defaultClassName: active ? undefined : "bos-icon-muted",
      })}
      style={iconSvgColorStyle(semanticColor)}
    />
  );
}
