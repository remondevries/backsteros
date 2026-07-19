export const PROJECT_STATUSES = [
  "backlog",
  "active",
  "on_hold",
  "completed",
  "canceled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  canceled: "Canceled",
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [...PROJECT_STATUSES];

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function getProjectStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS[status];
}

export function migrateLegacyProjectStatus(status: string): ProjectStatus {
  if (isProjectStatus(status)) {
    return status;
  }
  return "backlog";
}
