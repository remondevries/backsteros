/** Mirrors `@backsteros/ui` project-status helpers. */

export const PROJECT_STATUSES = [
  "backlog",
  "active",
  "on_hold",
  "completed",
  "canceled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Display / board column order — mirrors `@backsteros/ui`. */
export const PROJECT_STATUS_ORDER: readonly ProjectStatus[] = [
  ...PROJECT_STATUSES,
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  canceled: "Canceled",
};

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function migrateLegacyProjectStatus(
  status: string | null | undefined,
): ProjectStatus {
  if (status && isProjectStatus(status)) return status;
  return "backlog";
}

export function getProjectStatusLabel(
  status: string | null | undefined,
): string {
  return PROJECT_STATUS_LABELS[migrateLegacyProjectStatus(status)];
}

export type ProjectLikeForGrouping = {
  status: string | null;
  sort_order?: number | null;
};

export type ProjectStatusGroup<
  T extends ProjectLikeForGrouping = ProjectLikeForGrouping,
> = {
  status: ProjectStatus;
  label: string;
  projects: T[];
};

/** Group projects by status for section lists (org / area project boards). */
export function groupProjectsByStatus<T extends ProjectLikeForGrouping>(
  projects: readonly T[],
): ProjectStatusGroup<T>[] {
  const buckets = new Map<ProjectStatus, T[]>();
  for (const status of PROJECT_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const project of projects) {
    const status = migrateLegacyProjectStatus(project.status);
    buckets.get(status)?.push(project);
  }

  return PROJECT_STATUS_ORDER.map((status) => ({
    status,
    label: getProjectStatusLabel(status),
    projects: (buckets.get(status) ?? []).sort(
      (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
    ),
  })).filter((group) => group.projects.length > 0);
}
