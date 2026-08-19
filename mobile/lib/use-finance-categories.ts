import { fetchFinancialCategories } from "./finance-api";
import type { FinanceCategoryRow } from "./finance-categories";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useSyncedOrRest } from "./use-synced-or-rest";

type SyncedCategoryRow = {
  id: string;
  name: string | null;
  parent_id: string | null;
  kind: string | null;
  listing: string | null;
  icon: string | null;
  sort_order: number | null;
};

const CATEGORIES_SQL = `SELECT id, name, parent_id, kind, listing, icon, sort_order
 FROM financial_categories
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

/** Financial categories — PowerSync Tier B table with REST reconciliation. */
export function useFinanceCategories() {
  const client = useMobileApiClient();
  return useSyncedOrRest<SyncedCategoryRow, FinanceCategoryRow>({
    sql: CATEGORIES_SQL,
    mapLocal: (rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name?.trim() || "Untitled",
        parentId: row.parent_id,
        kind: row.kind ?? "regular",
        listing: row.listing ?? "listed",
        icon: row.icon,
        sortOrder: row.sort_order ?? 0,
      })),
    fetchRest: async () => {
      const categories = await fetchFinancialCategories(client);
      return categories.map((category) => ({
        id: category.id,
        name: category.name.trim() || "Untitled",
        parentId: category.parentId,
        kind: category.kind,
        listing: category.listing,
        icon: category.icon,
        sortOrder: category.sortOrder,
      }));
    },
  });
}
