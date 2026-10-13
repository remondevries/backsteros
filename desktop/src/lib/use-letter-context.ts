import { usePowerSyncQuery } from "./powersync-context";

/** One-row detail watch — list SQL omits `context`. */
export const LETTER_CONTEXT_SQL = `SELECT id, context FROM letters WHERE id = ? AND deleted_at IS NULL LIMIT 1`;

type LetterContextRow = {
  id: string;
  context: string | null;
};

function asContext(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Letter notes live in `letters.context`. List watches omit that column, so
 * the detail pane must read it on its own. PowerSync already syncs it.
 */
export function useDesktopLetterContext(
  letterId: string | null | undefined,
  options?: { enabled?: boolean },
): { context: string; loading: boolean } {
  const enabled = options?.enabled !== false;
  const id = letterId?.trim() || null;
  const local = usePowerSyncQuery<LetterContextRow>(
    enabled && id ? LETTER_CONTEXT_SQL : null,
    enabled && id ? [id] : [],
  );
  const row = local.data?.[0] ?? null;
  return {
    context: row ? asContext(row.context) : "",
    loading: local.loading,
  };
}
