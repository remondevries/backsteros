/**
 * Soft-unique indexes (partial UNIQUE WHERE deleted_at IS NULL) can fork when
 * leader-first fallback invents a second UUID for the same business key.
 * Table twin apply must clear the loser instead of failing the whole page.
 */

export type PgErrorInfo = {
  code: string;
  constraint: string | null;
  detail: string | null;
};

export function readPgError(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current === "object" && current !== null && "code" in current) {
      const code = String((current as { code: unknown }).code ?? "");
      if (/^\d{5}$/.test(code)) {
        const constraint =
          "constraint_name" in current &&
          typeof (current as { constraint_name: unknown }).constraint_name ===
            "string"
            ? (current as { constraint_name: string }).constraint_name
            : "constraint" in current &&
                typeof (current as { constraint: unknown }).constraint ===
                  "string"
              ? (current as { constraint: string }).constraint
              : null;
        const detail =
          "detail" in current &&
          typeof (current as { detail: unknown }).detail === "string"
            ? (current as { detail: string }).detail
            : null;
        return { code, constraint, detail };
      }
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return readPgError(error)?.code === "23505";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return readPgError(error)?.code === "23503";
}

/** Soft-unique constraints that twin apply can heal by soft-deleting losers. */
export const HEALABLE_SOFT_UNIQUE_CONSTRAINTS = new Set([
  "tasks_habit_due_unique",
  "tasks_workspace_scope_number_unique",
  "organizations_workspace_number_unique",
  "contacts_workspace_number_unique",
]);

export function isHealableSoftUnique(error: unknown): boolean {
  const info = readPgError(error);
  return (
    info?.code === "23505" &&
    Boolean(info.constraint) &&
    HEALABLE_SOFT_UNIQUE_CONSTRAINTS.has(info.constraint!)
  );
}
