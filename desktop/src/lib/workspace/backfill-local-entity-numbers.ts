import type { SyncedMetadataTable } from "../powersync-context";
import type { WorkspacePowerSync } from "./workspace-data-types";

type NumberedRow = {
  id: string;
  number?: number | null;
};

function entityNumberMissing(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "number" && (!Number.isFinite(value) || value <= 0))
  );
}

/**
 * Patch local SQLite `number` from REST for rows that still carry null/0 after
 * create or scope-move upload. List merges prefer PowerSync, so fill-from-API
 * alone can leave the UI blank until the next download checkpoint.
 */
export async function backfillLocalEntityNumbersFromApi<T extends NumberedRow>(
  powerSync: WorkspacePowerSync,
  table: SyncedMetadataTable,
  localRows: readonly T[] | null | undefined,
  apiRows: readonly T[] | null | undefined,
): Promise<number> {
  if (!powerSync.ready || !powerSync.patchMetadata) return 0;
  if (!localRows?.length || !apiRows?.length) return 0;

  const apiById = new Map(apiRows.map((row) => [row.id, row]));
  let patched = 0;

  for (const local of localRows) {
    if (!entityNumberMissing(local.number)) continue;
    const api = apiById.get(local.id);
    if (!api || entityNumberMissing(api.number)) continue;
    try {
      await powerSync.patchMetadata(table, local.id, {
        number: api.number,
      });
      patched += 1;
    } catch (error) {
      console.warn(
        `[desktop] local ${table} number backfill failed`,
        local.id,
        error,
      );
    }
  }

  return patched;
}
