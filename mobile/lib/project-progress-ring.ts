/**
 * Project task-completion hex geometry — mirrors
 * `@backsteros/ui` `project-progress-ring.ts`.
 */

import { TASK_STATUS_RING_STROKE_WIDTH } from "./task-status-icon-model";

const ICON_CENTER = 7;
const TASK_STATUS_RING_RADIUS = 6;
const PIE_RING_GAP = 1.75;
const HEX_PIE_RADIUS =
  TASK_STATUS_RING_RADIUS - TASK_STATUS_RING_STROKE_WIDTH / 2 - PIE_RING_GAP;

export const PROJECT_PROGRESS_HEX_STROKE_WIDTH = TASK_STATUS_RING_STROKE_WIDTH;

export type ProjectTaskProgress = {
  total: number;
  completed: number;
};

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

export function describeProjectProgressHexagonPath(
  radius: number = TASK_STATUS_RING_RADIUS,
): string {
  const points = Array.from({ length: 6 }, (_, index) => {
    const point = polarToCartesian(ICON_CENTER, ICON_CENTER, radius, index * 60);
    return `${point.x} ${point.y}`;
  });
  return `M ${points.join(" L ")} Z`;
}

export function describeProjectProgressPieWedge(fillRatio: number): string {
  if (fillRatio <= 0) return "";

  const cx = ICON_CENTER;
  const cy = ICON_CENTER;
  const radius = HEX_PIE_RADIUS;

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

export function computeProjectTaskProgressRatio(
  completed: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, completed / total));
}

export function formatProjectTaskProgressPercent(
  progress: ProjectTaskProgress,
): string {
  if (progress.total <= 0) {
    return "0%";
  }
  const ratio = computeProjectTaskProgressRatio(
    progress.completed,
    progress.total,
  );
  return `${Math.round(ratio * 100)}%`;
}

export function formatProjectTaskProgressLabel(
  progress: ProjectTaskProgress,
): string {
  if (progress.total <= 0) {
    return "No tasks";
  }
  return `${progress.completed} of ${progress.total} completed`;
}

export function aggregateTaskProgressByProjectId(
  tasks: ReadonlyArray<{ project_id: string | null; status: string | null }>,
): Record<string, ProjectTaskProgress> {
  const progress: Record<string, ProjectTaskProgress> = {};
  for (const task of tasks) {
    if (!task.project_id) continue;
    const entry = progress[task.project_id] ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (task.status === "completed") entry.completed += 1;
    progress[task.project_id] = entry;
  }
  return progress;
}
