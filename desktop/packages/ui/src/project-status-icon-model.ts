import type { ProjectStatus } from "./project-status.js";
import type { TaskStatus } from "./task-status.js";
import {
  resolveTaskStatusColor,
  type TaskStatusColorScheme,
} from "./task-status-color.js";

export type ProjectStatusIconModel =
  | { kind: "backlog"; color: string }
  | { kind: "completed"; color: string }
  | { kind: "ring"; color: string; fillRatio: number };

const PROJECT_RING_FILL_BY_STATUS: Partial<Record<ProjectStatus, number>> = {
  active: 0.48,
  on_hold: 0.34,
  canceled: 0,
};

export function mapProjectStatusToTaskStatusIcon(
  status: ProjectStatus,
): TaskStatus {
  switch (status) {
    case "active":
      return "in_progress";
    case "backlog":
      return "backlog";
    case "on_hold":
      return "on_hold";
    case "completed":
      return "completed";
    case "canceled":
      return "canceled";
  }
}

export function computeProjectStatusIconModel(input: {
  status: ProjectStatus;
  colorOverride?: string;
  colorScheme?: TaskStatusColorScheme;
}): ProjectStatusIconModel {
  const color = resolveTaskStatusColor(
    mapProjectStatusToTaskStatusIcon(input.status),
    input.colorOverride,
    { colorScheme: input.colorScheme },
  );

  if (input.status === "backlog") {
    return { kind: "backlog", color };
  }

  if (input.status === "completed") {
    return { kind: "completed", color };
  }

  return {
    kind: "ring",
    color,
    fillRatio: PROJECT_RING_FILL_BY_STATUS[input.status] ?? 0,
  };
}
