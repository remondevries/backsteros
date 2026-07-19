import type { CSSProperties } from "react";

import { migrateLegacyTaskStatus, type TaskStatus } from "./task-status.js";

export type TaskStatusHeaderGradient = {
  from: string;
  to: string;
};

/** Per-status horizontal header gradients (left → right). Tweak per status as needed. */
const STATUS_HEADER_GRADIENTS: Record<TaskStatus, TaskStatusHeaderGradient> = {
  triage: {
    from: "#ee7a4710",
    to: "#ffffff05",
  },
  backlog: {
    from: "#bfc2c705",
    to: "#ffffff05",
  },
  ready_to_start: {
    from: "#ffffff05",
    to: "#ffffff05",
  },
  in_progress: {
    from: "#e3c25910",
    to: "#ffffff05",
  },
  on_hold: {
    from: "#cb686110",
    to: "#ffffff05",
  },
  in_review: {
    from: "#67a25a10",
    to: "#ffffff05",
  },
  completed: {
    from: "#626ac610",
    to: "#ffffff05",
  },
  canceled: {
    from: "#bfc2c705",
    to: "#ffffff05",
  },
  duplicated: {
    from: "#bfc2c705",
    to: "#ffffff05",
  },
};

export function getTaskStatusHeaderGradient(
  status: TaskStatus | string,
): TaskStatusHeaderGradient {
  return STATUS_HEADER_GRADIENTS[migrateLegacyTaskStatus(status)];
}

export function formatTaskStatusHeaderGradientCss(
  gradient: TaskStatusHeaderGradient,
): string {
  return `linear-gradient(90deg, ${gradient.from}, ${gradient.to})`;
}

export function getTaskStatusHeaderGradientStyle(
  status: TaskStatus | string,
): CSSProperties {
  return {
    backgroundImage: formatTaskStatusHeaderGradientCss(
      getTaskStatusHeaderGradient(status),
    ),
  };
}
