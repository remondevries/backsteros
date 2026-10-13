"use client";

import { useSyncExternalStore } from "react";

import {
  getClientEstimateStatusLabel,
  migrateClientEstimateStatus,
  CLIENT_ESTIMATE_STATUS_TASK_ICON,
  type ClientEstimateStatus,
} from "../../finance/estimate-status.js";
import { iconSvgColorStyle, mergeIconSvgClassName } from "../../entity/icon-color.js";
import {
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";

export type EstimateStatusIconProps = {
  status: ClientEstimateStatus | string | null | undefined;
  size?: number;
  className?: string;
  title?: string;
};

/** Solid grey disc with a horizontal bar — closed / declined. */
function DeclinedStatusIcon() {
  return (
    <path
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7 0C3.134 0 0 3.134 0 7s3.134 7 7 7 7-3.134 7-7S10.866 0 7 0ZM3.5 6.25h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1 0-1.5Z"
    />
  );
}

/**
 * Estimate status mark. Declined is a solid grey disc with “-”; other statuses
 * reuse the mapped task-status icons.
 */
export function EstimateStatusIcon({
  status,
  size = 14,
  className,
  title,
}: EstimateStatusIconProps) {
  const resolved = migrateClientEstimateStatus(status);
  const label = title ?? getClientEstimateStatusLabel(resolved);
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );

  if (resolved === "declined") {
    const color = resolveTaskStatusColor("canceled", undefined, { colorScheme });
    return (
      <svg
        className={mergeIconSvgClassName(className)}
        style={iconSvgColorStyle(color)}
        viewBox="0 0 14 14"
        width={size}
        height={size}
        aria-label={label}
        role="img"
      >
        <title>{label}</title>
        <DeclinedStatusIcon />
      </svg>
    );
  }

  return (
    <TaskStatusIcon
      status={CLIENT_ESTIMATE_STATUS_TASK_ICON[resolved]}
      size={size}
      className={className}
      title={label}
    />
  );
}
