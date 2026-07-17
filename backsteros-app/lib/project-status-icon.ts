import type { ProjectStatus } from "@/lib/project-status";
import {
  resolveTaskStatusColor,
  type TaskStatusColorScheme,
} from "@/lib/task-status-color";

export type ProjectStatusIconModel =
  | { kind: "backlog"; color: string }
  | { kind: "completed"; color: string }
  | { kind: "ring"; color: string; fillRatio: number };

const PROJECT_RING_FILL_BY_STATUS: Partial<Record<ProjectStatus, number>> = {
  active: 0.48,
  on_hold: 0.34,
  canceled: 0,
};

/** Map project status to the task status used for shared color styling. */
export function mapProjectStatusToTaskStatusIcon(
  status: ProjectStatus,
): import("@/lib/task-status").TaskStatus {
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
