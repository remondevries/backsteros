export type ProjectTaskProgress = {
  total: number;
  completed: number;
};

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
