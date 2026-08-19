import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AccountIncomeExpenseYearChart } from "../../../../components/finance/account-income-expense-year-chart";
import { FinanceAccountSettingsModal } from "../../../../components/finance/finance-account-settings-modal";
import { TransactionList } from "../../../../components/finance/transaction-list";
import { YearNavigator } from "../../../../components/finance/year-navigator";
import { SettingsNavIcon } from "../../../../components/nav-icons";
import { isPadDevice } from "../../../../lib/device";
import { rememberFinanceSection } from "../../../../lib/finance-section-memory";
import { padAwareDetailHeaderOptions } from "../../../../lib/pad-aware-detail-header";
import { colors, spacing } from "../../../../lib/theme";
import { useBankAccountCashflow } from "../../../../lib/use-bank-account-cashflow";
import { useFinanceDetailBack } from "../../../../lib/use-finance-detail-back";
import { useFinanceAccounts } from "../../../../lib/use-finance-accounts";
import { useFinanceCategories } from "../../../../lib/use-finance-categories";

export default function FinanceAccountScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const onBack = useFinanceDetailBack("accounts");
  const isPad = isPadDevice();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const maxYear = useMemo(() => new Date().getFullYear(), []);
  const [cashflowYear, setCashflowYear] = useState(maxYear);

  const accounts = useFinanceAccounts();
  const categories = useFinanceCategories();
  const account = accounts.rows.find((row) => row.id === id) ?? null;
  const cashflow = useBankAccountCashflow(id, cashflowYear);

  useLayoutEffect(() => {
    rememberFinanceSection("accounts");
    navigation.setOptions(
      padAwareDetailHeaderOptions({
        onBack,
      }),
    );
  }, [navigation, onBack]);

  const baseFilters = useMemo(() => ({ accountId: id }), [id]);

  const settingsButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account settings"
      hitSlop={10}
      onPress={() => {
        if (isPad) {
          setSettingsOpen(true);
          return;
        }
        router.push({
          pathname: "/finance/account-form",
          params: { id },
        });
      }}
    >
      <SettingsNavIcon color={colors.foreground} size={20} />
    </Pressable>
  );

  const chartHeader = (
    <View style={styles.chartBlock}>
      <View style={styles.yearRow}>
        <YearNavigator
          year={cashflowYear}
          onChange={setCashflowYear}
          maxYear={maxYear}
        />
      </View>
      <AccountIncomeExpenseYearChart
        points={cashflow.points}
        loading={cashflow.loading}
        height={isPad ? 200 : 170}
      />
    </View>
  );

  return (
    <>
      <TransactionList
        baseFilters={baseFilters}
        categories={categories.rows}
        emptyText="No transactions for this account."
        pageTitle={account?.name ?? "Account"}
        pageTitleTrailing={settingsButton}
        listHeaderExtra={chartHeader}
        onRefreshExtra={() => void cashflow.reload()}
      />
      {isPad ? (
        <FinanceAccountSettingsModal
          visible={settingsOpen}
          accountId={id}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chartBlock: {
    paddingHorizontal: spacing.screenX,
    paddingBottom: 12,
    gap: 10,
  },
  yearRow: {
    alignItems: "center",
  },
});
