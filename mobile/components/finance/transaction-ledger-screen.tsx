import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { TransactionLedgerPanel } from "./transaction-ledger-panel";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";
import { padAwareDetailHeaderOptions } from "../../lib/pad-aware-detail-header";
import { useFinanceTransaction } from "../../lib/use-finance-transaction";
import { colors } from "../../lib/theme";
import { ui } from "../../lib/ui";

/**
 * iPhone full-screen ledger — same fields as the iPad / desktop ledger tray.
 */
export function TransactionLedgerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useFinanceTransaction(id);

  const onBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (id) {
      router.replace(`/finance/transaction/${id}`);
      return;
    }
    router.replace("/finance/transactions");
  }, [id, router]);

  const screenOptions = {
    ...tabDetailScreenOptions(),
    ...padAwareDetailHeaderOptions({
      title: "Ledger",
      onBack,
    }),
    title: "Ledger",
    headerTitle: () => (
      <Text style={styles.headerTitle} numberOfLines={1}>
        Ledger
      </Text>
    ),
    headerTitleAlign: "center" as const,
  };

  if (detail.loading && !detail.transaction) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  if (!detail.transaction) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={ui.screen}>
          <Text style={ui.error}>
            {detail.error ?? "Transaction not found."}
          </Text>
          <Text style={ui.hint} onPress={() => void detail.reload()}>
            Tap to retry
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={styles.root}>
        <TransactionLedgerPanel transaction={detail.transaction} />
        <View style={{ height: FLOATING_TAB_BAR_CLEARANCE }} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
  },
});
