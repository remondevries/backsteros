import { migrateLegacyTaskStatus, type TaskStatus } from "./task-status";
import {
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "./project-status";

export type StatusHeaderGradient = {
  from: string;
  to: string;
};

/** Per-status horizontal header gradients — parity with `@backsteros/ui`. */
const TASK_STATUS_HEADER_GRADIENTS: Record<TaskStatus, StatusHeaderGradient> = {
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

const PROJECT_STATUS_TO_TASK: Record<ProjectStatus, TaskStatus> = {
  backlog: "backlog",
  active: "in_progress",
  on_hold: "on_hold",
  completed: "completed",
  canceled: "canceled",
};

/** Parse `#RRGGBB` or `#RRGGBBAA` into RGB + 0–1 alpha. */
export function parseCssHexColor(value: string): {
  color: string;
  opacity: number;
} {
  const hex = value.trim().replace(/^#/, "");
  if (hex.length === 8) {
    const rgb = hex.slice(0, 6);
    const alpha = Number.parseInt(hex.slice(6, 8), 16) / 255;
    return { color: `#${rgb}`, opacity: Number.isFinite(alpha) ? alpha : 1 };
  }
  if (hex.length === 6) {
    return { color: `#${hex}`, opacity: 1 };
  }
  return { color: "#ffffff", opacity: 0.02 };
}

export function getTaskStatusHeaderGradient(
  status: TaskStatus | string,
): StatusHeaderGradient {
  return TASK_STATUS_HEADER_GRADIENTS[migrateLegacyTaskStatus(status)];
}

export function getProjectStatusHeaderGradient(
  status: ProjectStatus | string,
): StatusHeaderGradient {
  const project = migrateLegacyProjectStatus(status);
  return getTaskStatusHeaderGradient(PROJECT_STATUS_TO_TASK[project]);
}
