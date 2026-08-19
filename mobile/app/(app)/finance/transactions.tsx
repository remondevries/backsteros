import { useNavigation } from "@react-navigation/native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useLayoutEffect, useMemo } from "react";

import {
  FinanceTransactionsPane,
  useFinanceTransactionsFilterSheet,
} from "../../../components/finance/finance-transactions-pane";
import { type TransactionsFilterValue } from "../../../components/finance/transactions-filter-sheet";
import { isPadDevice } from "../../../lib/device";
import { rememberFinanceSection } from "../../../lib/finance-section-memory";
import { rememberFinanceTransactionsFilters } from "../../../lib/finance-transactions-filter-memory";
import { financePadSectionHeaderOptions } from "../../../lib/pad-aware-detail-header";

/**
 * iPad stack route for Transactions. On phone, redirect into the sticky
 * Finance home shell so the header stays put while switching sections.
 */
export default function FinanceTransactionsScreen() {
  const isPad = isPadDevice();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    uncategorized?: string;
    categoryId?: string;
    accountId?: string;
  }>();

  const initialFilters = useMemo<TransactionsFilterValue>(
    () => ({
      accountId: params.accountId || undefined,
      categoryId: params.categoryId || undefined,
      uncategorized: params.uncategorized === "1" || undefined,
    }),
    [params.accountId, params.categoryId, params.uncategorized],
  );

  const {
    filters,
    setFilters,
    filterSheetOpen,
    setFilterSheetOpen,
  } = useFinanceTransactionsFilterSheet(initialFilters);

  useLayoutEffect(() => {
    if (!isPad) return;
    navigation.setOptions(financePadSectionHeaderOptions());
  }, [isPad, navigation]);

  if (!isPad) {
    rememberFinanceSection("transactions");
    rememberFinanceTransactionsFilters(initialFilters);
    return <Redirect href="/finance" />;
  }

  return (
    <FinanceTransactionsPane
      filters={filters}
      onFiltersChange={setFilters}
      filterSheetOpen={filterSheetOpen}
      onFilterSheetOpenChange={setFilterSheetOpen}
    />
  );
}
