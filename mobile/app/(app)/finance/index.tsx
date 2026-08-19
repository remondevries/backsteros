import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useState } from "react";
import { View } from "react-native";

import { FinanceAccountsPane } from "../../../components/finance/finance-accounts-pane";
import { FinanceCashflowPane } from "../../../components/finance/finance-cashflow-pane";
import { FinanceCategoriesPane } from "../../../components/finance/finance-categories-pane";
import { FinanceDashboardPane } from "../../../components/finance/finance-dashboard-pane";
import { FinanceGoalsPane } from "../../../components/finance/finance-goals-pane";
import { FinanceHeader } from "../../../components/finance/finance-header";
import { FinanceInvestmentsPane } from "../../../components/finance/finance-investments-pane";
import { FinanceInvoicesPane } from "../../../components/finance/finance-invoices-pane";
import { FinanceRecurringsPane } from "../../../components/finance/finance-recurrings-pane";
import { FinanceTransactionsPane } from "../../../components/finance/finance-transactions-pane";
import {
  type TransactionsFilterValue,
} from "../../../components/finance/transactions-filter-sheet";
import { isPadDevice } from "../../../lib/device";
import {
  getRememberedFinanceSection,
  rememberFinanceSection,
} from "../../../lib/finance-section-memory";
import { type MobileFinanceSectionId } from "../../../lib/finance-sections";
import { financePadSectionHeaderOptions } from "../../../lib/pad-aware-detail-header";
import type { FinanceGoNavigationItem } from "../../../lib/finance-go-navigation";
import {
  getRememberedFinanceTransactionsFilters,
  rememberFinanceTransactionsFilters,
} from "../../../lib/finance-transactions-filter-memory";
import { ui } from "../../../lib/ui";
import { useFinanceNavigationShortcuts } from "../../../lib/use-finance-navigation-shortcuts";

/**
 * Phone: Tasks-style sticky header + in-place section tabs (content swaps).
 * iPad: dashboard only — sections live in the side nav + stack routes.
 */
export default function FinanceHomeScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const isPad = isPadDevice();

  const [section, setSectionState] = useState<MobileFinanceSectionId>(
    getRememberedFinanceSection,
  );
  const [filters, setFiltersState] = useState<TransactionsFilterValue>(
    getRememberedFinanceTransactionsFilters,
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const setSection = useCallback((next: MobileFinanceSectionId) => {
    rememberFinanceSection(next);
    setSectionState(next);
  }, []);

  const setFilters = useCallback((next: TransactionsFilterValue) => {
    rememberFinanceTransactionsFilters(next);
    setFiltersState(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isPad) return;
      setSectionState(getRememberedFinanceSection());
      setFiltersState(getRememberedFinanceTransactionsFilters());
    }, [isPad]),
  );

  const onFinanceGo = useCallback(
    (item: FinanceGoNavigationItem) => {
      setSection(item.id);
    },
    [setSection],
  );

  useFinanceNavigationShortcuts({
    enabled: !isPad,
    onNavigate: onFinanceGo,
  });

  const onReviewAll = useCallback(() => {
    if (isPad) {
      router.push({
        pathname: "/finance/transactions",
        params: { uncategorized: "1" },
      });
      return;
    }
    setFilters({ uncategorized: true });
    setSection("transactions");
  }, [isPad, router, setFilters, setSection]);

  useLayoutEffect(() => {
    if (isPad) {
      navigation.setOptions(
        financePadSectionHeaderOptions({ title: "Dashboard" }),
      );
      return;
    }

    navigation.setOptions({
      header: () => (
        <FinanceHeader section={section} onSectionChange={setSection} />
      ),
    });
  }, [isPad, navigation, section, setSection]);

  if (isPad) {
    return <FinanceDashboardPane onReviewAll={onReviewAll} />;
  }

  return (
    <View style={ui.screen}>
      {section === "dashboard" ? (
        <FinanceDashboardPane onReviewAll={onReviewAll} />
      ) : null}
      {section === "transactions" ? (
        <FinanceTransactionsPane
          filters={filters}
          onFiltersChange={setFilters}
          filterSheetOpen={filterSheetOpen}
          onFilterSheetOpenChange={setFilterSheetOpen}
        />
      ) : null}
      {section === "invoices" ? <FinanceInvoicesPane /> : null}
      {section === "goals" ? <FinanceGoalsPane /> : null}
      {section === "cashflow" ? <FinanceCashflowPane /> : null}
      {section === "accounts" ? <FinanceAccountsPane /> : null}
      {section === "investments" ? <FinanceInvestmentsPane /> : null}
      {section === "categories" ? <FinanceCategoriesPane /> : null}
      {section === "recurrings" ? <FinanceRecurringsPane /> : null}
    </View>
  );
}
