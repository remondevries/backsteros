/**
 * Default project picker / project-search visibility (OS-7).
 * Terminal statuses stay off those lists unless the caller keeps a current value.
 */

export const PROJECT_PICKER_DEFAULT_EXCLUDED_STATUSES = [
  "completed",
  "canceled",
  "duplicated",
] as const;

export type ProjectPickerDefaultExcludedStatus =
  (typeof PROJECT_PICKER_DEFAULT_EXCLUDED_STATUSES)[number];

const EXCLUDED = new Set<string>(PROJECT_PICKER_DEFAULT_EXCLUDED_STATUSES);

export function isProjectPickerDefaultVisibleStatus(
  status: string | null | undefined,
): boolean {
  if (status == null) return true;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return true;
  return !EXCLUDED.has(normalized);
}

export function filterProjectsForDefaultPicker<
  T extends {
    status?: string | null;
    id?: string | null;
    key?: string | null;
  },
>(
  projects: readonly T[],
  options?: {
    keepIds?: readonly (string | null | undefined)[];
    keepKeys?: readonly (string | null | undefined)[];
  },
): T[] {
  const keepIds = new Set(
    (options?.keepIds ?? []).filter((id): id is string => Boolean(id)),
  );
  const keepKeys = new Set(
    (options?.keepKeys ?? []).filter((key): key is string => Boolean(key)),
  );

  return projects.filter((project) => {
    if (project.id && keepIds.has(project.id)) return true;
    if (project.key && keepKeys.has(project.key)) return true;
    return isProjectPickerDefaultVisibleStatus(project.status);
  });
}
