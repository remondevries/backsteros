import type { TaskStatus } from "./task-status.js";
import {
  resolveTaskStatusColor,
  type TaskStatusColorScheme,
} from "./task-status-color.js";

export type TaskStatusIconModel =
  | { kind: "triage"; color: string }
  | { kind: "backlog"; color: string }
  | { kind: "completed"; color: string }
  | { kind: "duplicated"; color: string }
  | { kind: "ring"; color: string; fillRatio: number };

const RING_FILL_BY_STATUS: Partial<Record<TaskStatus, number>> = {
  ready_to_start: 0.18,
  in_progress: 0.48,
  on_hold: 0.34,
  in_review: 0.72,
  canceled: 0,
};

export function computeTaskStatusIconModel(input: {
  status: TaskStatus;
  colorOverride?: string;
  colorScheme?: TaskStatusColorScheme;
}): TaskStatusIconModel {
  const color = resolveTaskStatusColor(input.status, input.colorOverride, {
    colorScheme: input.colorScheme,
  });

  if (input.status === "triage") {
    return { kind: "triage", color };
  }

  if (input.status === "backlog") {
    return { kind: "backlog", color };
  }

  if (input.status === "completed") {
    return { kind: "completed", color };
  }

  if (input.status === "duplicated") {
    return { kind: "duplicated", color };
  }

  return {
    kind: "ring",
    color,
    fillRatio: RING_FILL_BY_STATUS[input.status] ?? 0,
  };
}

const ICON_CENTER = 7;
export const TASK_STATUS_RING_RADIUS = 6;
export const TASK_STATUS_RING_STROKE_WIDTH = 1.5;
const PIE_RING_GAP = 1.75;
const PIE_RADIUS =
  TASK_STATUS_RING_RADIUS - TASK_STATUS_RING_STROKE_WIDTH / 2 - PIE_RING_GAP;

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

export function describeTaskStatusPieWedge(
  fillRatio: number,
  radius: number = PIE_RADIUS,
): string {
  if (fillRatio <= 0) return "";

  const cx = ICON_CENTER;
  const cy = ICON_CENTER;

  if (fillRatio >= 1) {
    const top = polarToCartesian(cx, cy, radius, 0);
    return `M ${cx} ${cy} L ${top.x} ${top.y} A ${radius} ${radius} 0 1 1 ${top.x - 0.001} ${top.y} Z`;
  }

  const sweepAngle = fillRatio * 360;
  const start = polarToCartesian(cx, cy, radius, 0);
  const end = polarToCartesian(cx, cy, radius, sweepAngle);
  const largeArc = sweepAngle > 180 ? 1 : 0;

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

export function taskStatusRingPath(): string {
  return `M13 7C13 3.686 10.314 1 7 1C3.686 1 1 3.686 1 7C1 10.314 3.686 13 7 13C10.314 13 13 10.314 13 7Z`;
}
