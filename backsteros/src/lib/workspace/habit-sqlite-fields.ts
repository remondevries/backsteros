import type { Habit as ApiHabit } from "@backsteros/contracts";

/** API / UI patch fields for habit updates. */
export type HabitUpdatePatch = {
  title?: string;
  cadence?: ApiHabit["cadence"];
  icon?: string | null;
  description?: string | null;
  projectId?: string;
  nextDueYmd?: string;
};

/**
 * Map habit PATCH input to PowerSync SQLite column names.
 * `nextDueYmd` is API-only — persisted as `cadence_anchor_ymd` (see mobile).
 */
export function habitPatchToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "projectId") {
      sqliteValues.project_id = value;
      continue;
    }
    if (key === "cadenceAnchorYmd" || key === "nextDueYmd") {
      sqliteValues.cadence_anchor_ymd = value;
      continue;
    }
    if (key === "sortOrder") {
      sqliteValues.sort_order = value;
      continue;
    }
    if (
      key === "title" ||
      key === "icon" ||
      key === "description" ||
      key === "cadence"
    ) {
      sqliteValues[key] = value;
    }
  }
  return sqliteValues;
}

/** Merge an API patch into a habit row for optimistic UI state. */
export function applyHabitUpdatePatch(
  existing: ApiHabit,
  input: HabitUpdatePatch,
  updatedAt: string,
): ApiHabit {
  const { nextDueYmd, ...rest } = input;
  return {
    ...existing,
    ...rest,
    ...(nextDueYmd !== undefined ? { cadenceAnchorYmd: nextDueYmd } : {}),
    updatedAt,
  };
}
