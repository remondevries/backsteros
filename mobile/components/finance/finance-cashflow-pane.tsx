import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FinanceChartBoundary } from "./finance-chart-boundary";
import { CashflowIncomeYearChart } from "./cashflow-income-year-chart";
import { CashflowSpendYearChart } from "./cashflow-spend-year-chart";
import { FinanceCard } from "./finance-card";
import { MonthNavigator } from "./month-navigator";
import { NetIncomeYearChart } from "./net-income-year-chart";
import { ContentPageTitle } from "../content-page-title";
import { isPadDevice } from "../../lib/device";
import { currentMonthKey } from "../../lib/finance-format";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useFinanceCashflow } from "../../lib/use-finance-cashflow";
import { useFinanceCategories } from "../../lib/use-finance-categories";

/**
 * Cash Flow section — desktop parity:
 * month navigator, Net Income (full width), Spending + Income side-by-side on iPad.
 */
export function FinanceCashflowPane() {
  const isPad = isPadDevice();
  const maxMonthKey = useMemo(() => currentMonthKey(), []);
  const [monthKey, setMonthKey] = useState(maxMonthKey);
  const cashflow = useFinanceCashflow(monthKey);
  const categories = useFinanceCategories();

  const year = cashflow.data?.year ?? cashflow.year;
  const asOf = cashflow.data?.asOf ?? cashflow.asOf;
  const months = cashflow.data?.months ?? [];
  const categoryMonths = cashflow.data?.categoryMonths ?? [];

  if (cashflow.loading && !cashflow.data) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  const netCard = (
    <FinanceCard title="Net Income">
      <FinanceChartBoundary>
      <NetIncomeYearChart
        year={year}
        asOf={asOf}
        months={months}
        ytdNetCents={cashflow.data?.ytdNetCents ?? 0}
        priorYtdNetCents={cashflow.data?.priorYtdNetCents ?? 0}
        loading={cashflow.loading}
        height={isPad ? 240 : 200}
      />
      </FinanceChartBoundary>
    </FinanceCard>
  );

  const spendCard = (
    <FinanceCard title="Spending">
      <FinanceChartBoundary>
      <CashflowSpendYearChart
        year={year}
        asOf={asOf}
        categoryMonths={categoryMonths}
        categories={categories.rows}
        ytdExpenseCents={cashflow.data?.ytdExpenseCents ?? 0}
        priorYtdExpenseCents={cashflow.data?.priorYtdExpenseCents ?? 0}
        loading={cashflow.loading}
        height={isPad ? 210 : 180}
      />
      </FinanceChartBoundary>
    </FinanceCard>
  );

  const incomeCard = (
    <FinanceCard title="Income">
      <FinanceChartBoundary>
      <CashflowIncomeYearChart
        year={year}
        asOf={asOf}
        months={months}
        ytdIncomeCents={cashflow.data?.ytdIncomeCents ?? 0}
        priorYtdIncomeCents={cashflow.data?.priorYtdIncomeCents ?? 0}
        loading={cashflow.loading}
        height={isPad ? 210 : 180}
      />
      </FinanceChartBoundary>
    </FinanceCard>
  );

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={{
        paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        gap: 12,
      }}
      refreshControl={
        <RefreshControl
          refreshing={cashflow.refreshing}
          onRefresh={() => {
            void cashflow.refresh();
            void categories.reload();
          }}
          tintColor={colors.muted}
          colors={[colors.muted]}
        />
      }
    >
      <ContentPageTitle
        title="Cash Flow"
        trailing={
          <MonthNavigator
            monthKey={monthKey}
            onChange={setMonthKey}
            maxMonthKey={maxMonthKey}
          />
        }
      />
      {cashflow.error ? (
        <Text style={[ui.error, styles.errorPad]}>{cashflow.error}</Text>
      ) : null}
      <View style={styles.page}>
        {netCard}
        {isPad ? (
          <View style={styles.halfRow}>
            <View style={styles.half}>{spendCard}</View>
            <View style={styles.half}>{incomeCard}</View>
          </View>
        ) : (
          <>
            {spendCard}
            {incomeCard}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: spacing.screenX,
    gap: 16,
  },
  halfRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  half: {
    flex: 1,
    minWidth: 0,
  },
  errorPad: {
    paddingHorizontal: spacing.screenX,
  },
});
