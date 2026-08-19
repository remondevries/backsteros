import type { TransactionsFilterValue } from "../components/finance/transactions-filter-sheet";

/** Phone shell keeps transaction filters when switching sections / remounting. */
let rememberedFilters: TransactionsFilterValue = {};

export function rememberFinanceTransactionsFilters(
  filters: TransactionsFilterValue,
): void {
  rememberedFilters = { ...filters };
}

export function getRememberedFinanceTransactionsFilters(): TransactionsFilterValue {
  return { ...rememberedFilters };
}
