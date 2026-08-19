import { fetchFinancialRecurrings } from "./finance-api";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useSyncedOrRest } from "./use-synced-or-rest";

export type FinanceRecurringRow = {
  id: string;
  name: string;
  icon: string | null;
  categoryId: string | null;
  amountCents: number | null;
  nextDate: string | null;
  archived: boolean;
  sortOrder: number;
};

type SyncedRecurringRow = {
  id: string;
  name: string | null;
  icon: string | null;
  category_id: string | null;
  amount_cents: number | null;
  next_date: string | null;
  archived: number | null;
  sort_order: number | null;
};

const RECURRINGS_SQL = `SELECT id, name, icon, category_id, amount_cents, next_date,
   archived, sort_order
 FROM financial_recurrings
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

/** Financial recurrings — PowerSync Tier B with REST reconciliation. */
export function useFinanceRecurrings() {
  const client = useMobileApiClient();
  return useSyncedOrRest<SyncedRecurringRow, FinanceRecurringRow>({
    sql: RECURRINGS_SQL,
    mapLocal: (rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name?.trim() || "Untitled",
        icon: row.icon,
        categoryId: row.category_id,
        amountCents: row.amount_cents,
        nextDate: row.next_date,
        archived: Boolean(row.archived),
        sortOrder: row.sort_order ?? 0,
      })),
    fetchRest: async () => {
      const recurrings = await fetchFinancialRecurrings(client);
      return recurrings.map((row) => ({
        id: row.id,
        name: row.name.trim() || "Untitled",
        icon: row.icon,
        categoryId: row.categoryId,
        amountCents: row.amountCents,
        nextDate: row.nextDate,
        archived: row.archived,
        sortOrder: row.sortOrder,
      }));
    },
  });
}
