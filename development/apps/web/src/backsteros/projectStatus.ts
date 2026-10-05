export const BACKSTEROS_PROJECT_STATUSES = [
  "backlog",
  "active",
  "on_hold",
  "completed",
  "canceled",
] as const;

export type BacksterosProjectStatus = (typeof BACKSTEROS_PROJECT_STATUSES)[number];

export const BACKSTEROS_PROJECT_STATUS_LABELS: Record<BacksterosProjectStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  canceled: "Canceled",
};

export const BACKSTEROS_PROJECT_STATUS_ORDER: readonly BacksterosProjectStatus[] = [
  ...BACKSTEROS_PROJECT_STATUSES,
];

export function isBacksterosProjectStatus(value: string): value is BacksterosProjectStatus {
  return (BACKSTEROS_PROJECT_STATUSES as readonly string[]).includes(value);
}

export function getBacksterosProjectStatusLabel(status: BacksterosProjectStatus): string {
  return BACKSTEROS_PROJECT_STATUS_LABELS[status];
}

export function migrateBacksterosProjectStatus(status: string): BacksterosProjectStatus {
  return isBacksterosProjectStatus(status) ? status : "backlog";
}

export const BACKSTEROS_PROJECT_PICKER_DEFAULT_EXCLUDED_STATUSES = [
  "completed",
  "canceled",
  "duplicated",
] as const;

const PICKER_EXCLUDED = new Set<string>(BACKSTEROS_PROJECT_PICKER_DEFAULT_EXCLUDED_STATUSES);

export function isBacksterosProjectPickerDefaultVisibleStatus(status: string): boolean {
  return !PICKER_EXCLUDED.has(status.trim().toLowerCase());
}

export function filterBacksterosProjectsForDefaultPicker<
  T extends { readonly status: string; readonly id?: string },
>(
  projects: readonly T[],
  options?: { readonly keepIds?: readonly (string | null | undefined)[] },
): T[] {
  const keepIds = new Set((options?.keepIds ?? []).filter((id): id is string => Boolean(id)));
  return projects.filter((project) => {
    if (project.id && keepIds.has(project.id)) return true;
    return isBacksterosProjectPickerDefaultVisibleStatus(project.status);
  });
}

export type BacksterosProjectLikeForGrouping = {
  readonly status: string;
  readonly sortOrder?: number;
  readonly name?: string;
};

export type BacksterosProjectStatusGroup<T extends BacksterosProjectLikeForGrouping> = {
  readonly status: BacksterosProjectStatus;
  readonly label: string;
  readonly projects: readonly T[];
};

/** Mirrors BacksterOS desktop `groupProjectsByStatus`. */
export function groupBacksterosProjectsByStatus<T extends BacksterosProjectLikeForGrouping>(
  projects: readonly T[],
): BacksterosProjectStatusGroup<T>[] {
  const buckets = new Map<BacksterosProjectStatus, T[]>();
  for (const status of BACKSTEROS_PROJECT_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const project of projects) {
    const status = migrateBacksterosProjectStatus(project.status);
    buckets.get(status)?.push(project);
  }

  return BACKSTEROS_PROJECT_STATUS_ORDER.flatMap((status) => {
    const groupProjects = [...(buckets.get(status) ?? [])].sort((left, right) => {
      const orderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (orderDelta !== 0) return orderDelta;
      return (left.name ?? "").localeCompare(right.name ?? "", undefined, {
        sensitivity: "base",
      });
    });
    if (groupProjects.length === 0) return [];
    return [
      {
        status,
        label: getBacksterosProjectStatusLabel(status),
        projects: groupProjects,
      },
    ];
  });
}
