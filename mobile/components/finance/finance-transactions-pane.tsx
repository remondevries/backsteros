import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { TransactionList } from "./transaction-list";
import {
  TransactionsFilterSheet,
  transactionsFilterActive,
  type TransactionsFilterValue,
} from "./transactions-filter-sheet";
import { FilterIcon } from "../filter-icon";
import { TabStackHeaderIconButton } from "../../lib/tab-stack-options";
import { colors } from "../../lib/theme";
import { useFinanceAccounts } from "../../lib/use-finance-accounts";
import { useFinanceCategories } from "../../lib/use-finance-categories";

type Props = {
  filters: TransactionsFilterValue;
  onFiltersChange: (filters: TransactionsFilterValue) => void;
  filterSheetOpen: boolean;
  onFilterSheetOpenChange: (open: boolean) => void;
};

export function FinanceTransactionsPane({
  filters,
  onFiltersChange,
  filterSheetOpen,
  onFilterSheetOpenChange,
}: Props) {
  const accounts = useFinanceAccounts();
  const categories = useFinanceCategories();
  const filterActive = transactionsFilterActive(filters);

  const baseFilters = useMemo(
    () => ({
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      uncategorized: filters.uncategorized,
    }),
    [filters],
  );

  return (
    <>
      <TransactionList
        baseFilters={baseFilters}
        categories={categories.rows}
        pageTitle="Transactions"
        pageTitleTrailing={
          <View style={styles.filterWrap}>
            <TabStackHeaderIconButton
              accessibilityLabel="Filter transactions"
              onPress={() => onFilterSheetOpenChange(true)}
            >
              <FilterIcon
                color={filterActive ? colors.accent : colors.foreground}
              />
            </TabStackHeaderIconButton>
            {filterActive ? <View style={styles.filterDot} /> : null}
          </View>
        }
      />
      <TransactionsFilterSheet
        visible={filterSheetOpen}
        onClose={() => onFilterSheetOpenChange(false)}
        accounts={accounts.rows}
        categories={categories.rows}
        value={filters}
        onChange={onFiltersChange}
      />
    </>
  );
}

/** Local filter sheet state for iPad stack screens that own their header. */
export function useFinanceTransactionsFilterSheet(
  initial: TransactionsFilterValue = {},
) {
  const [filters, setFilters] = useState<TransactionsFilterValue>(initial);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  return {
    filters,
    setFilters,
    filterSheetOpen,
    setFilterSheetOpen,
  };
}

const styles = StyleSheet.create({
  filterWrap: {
    position: "relative",
  },
  filterDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
});
