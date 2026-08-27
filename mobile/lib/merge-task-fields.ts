/** Fill task scheduling fields when local PowerSync rows omit newer columns. */

function dueDateMissing(value: unknown): boolean {
  return value == null || value === "";
}

function updatedAtMs(value: string | number | Date | null | undefined): number {
  if (value == null) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export type TaskRowWithSchedule = {
  id: string;
  due_date?: string | null;
  due_end_date?: string | null;
  tracked_minutes?: number | null;
  tracked_duration_seconds?: number | null;
  agent_created_at?: string | null;
  agent_inbox_approved_at?: string | null;
  updated_at?: string | null;
};

export function fillMissingTaskFieldsFromApi<
  T extends TaskRowWithSchedule,
>(mergedRows: T[], apiRows: readonly T[] | null | undefined): T[] {
  if (!apiRows?.length) return mergedRows;
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api) return row;
    const next = { ...row };
    let changed = false;

    if (!dueDateMissing(api.due_date) && dueDateMissing(row.due_date)) {
      next.due_date = api.due_date ?? null;
      next.due_end_date = api.due_end_date ?? row.due_end_date ?? null;
      changed = true;
    } else if (
      !dueDateMissing(api.due_date) &&
      updatedAtMs(api.updated_at) > updatedAtMs(row.updated_at) &&
      (api.due_date !== row.due_date || api.due_end_date !== row.due_end_date)
    ) {
      next.due_date = api.due_date ?? null;
      next.due_end_date = api.due_end_date ?? null;
      changed = true;
    }

    if (
      (row.tracked_minutes == null && api.tracked_minutes != null) ||
      (row.tracked_duration_seconds == null &&
        api.tracked_duration_seconds != null)
    ) {
      next.tracked_minutes = api.tracked_minutes ?? row.tracked_minutes ?? null;
      next.tracked_duration_seconds =
        api.tracked_duration_seconds ?? row.tracked_duration_seconds ?? null;
      changed = true;
    }

    if (!row.agent_created_at && api.agent_created_at) {
      next.agent_created_at = api.agent_created_at;
      changed = true;
    }
    if (!row.agent_inbox_approved_at && api.agent_inbox_approved_at) {
      next.agent_inbox_approved_at = api.agent_inbox_approved_at;
      changed = true;
    }

    return changed ? next : row;
  });
}
