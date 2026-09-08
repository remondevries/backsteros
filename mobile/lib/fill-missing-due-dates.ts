/**
 * When PowerSync local omits / lags `due_date`, copy scheduling from a REST
 * snapshot — parity with desktop `fillMissingDueDatesFromApi`.
 *
 * Accepts snake_case list rows (`due_date`) and camelCase API-shaped rows
 * (`dueDate`).
 */

function dueDateMissing(value: unknown): boolean {
  return value == null || value === "";
}

function updatedAtMs(value: string | number | Date | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function readDueDate(row: {
  due_date?: string | null;
  dueDate?: string | null;
}): string | null {
  const value = row.due_date ?? row.dueDate ?? null;
  return dueDateMissing(value) ? null : String(value);
}

function readDueEndDate(row: {
  due_end_date?: string | null;
  dueEndDate?: string | null;
}): string | null {
  const value = row.due_end_date ?? row.dueEndDate ?? null;
  return dueDateMissing(value) ? null : String(value);
}

function readUpdatedAt(row: {
  updated_at?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}): string | number | Date | null | undefined {
  return row.updated_at ?? row.updatedAt;
}

export function fillMissingDueDatesFromApi<
  T extends {
    id: string;
    due_date?: string | null;
    dueDate?: string | null;
    due_end_date?: string | null;
    dueEndDate?: string | null;
    updated_at?: string | number | Date | null;
    updatedAt?: string | number | Date | null;
  },
>(mergedRows: readonly T[], apiRows: readonly T[] | null | undefined): T[] {
  if (!apiRows?.length) return [...mergedRows];
  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  return mergedRows.map((row) => {
    const api = apiById.get(row.id);
    if (!api) return row;
    const apiDue = readDueDate(api);
    const localDue = readDueDate(row);
    if (!apiDue) return row;
    if (!localDue) {
      return {
        ...row,
        due_date: apiDue,
        dueDate: apiDue,
        due_end_date: readDueEndDate(api) ?? readDueEndDate(row),
        dueEndDate: readDueEndDate(api) ?? readDueEndDate(row),
      };
    }
    if (
      updatedAtMs(readUpdatedAt(api)) > updatedAtMs(readUpdatedAt(row)) &&
      (apiDue !== localDue ||
        readDueEndDate(api) !== readDueEndDate(row))
    ) {
      return {
        ...row,
        due_date: apiDue,
        dueDate: apiDue,
        due_end_date: readDueEndDate(api),
        dueEndDate: readDueEndDate(api),
      };
    }
    return row;
  });
}
