import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListData,
} from "react-native";

import { FinanceAccountAvatar } from "./finance-account-avatar";
import { ContentPageTitle } from "../content-page-title";
import {
  bankAccountTypeLabel,
  groupBankAccounts,
} from "../../lib/bank-account-groups";
import { rememberFinanceSection } from "../../lib/finance-section-memory";
import { formatCents } from "../../lib/finance-format";
import { findSectionListLocation } from "../../lib/list-keyboard-nav";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { TabStackHeaderPlusButton } from "../../lib/tab-stack-options";
import { colors } from "../../lib/theme";
import { ui } from "../../lib/ui";
import {
  useBankAccountBalances,
  useFinanceAccountAvatarSrcMap,
  useFinanceAccounts,
  type FinanceAccountRow,
} from "../../lib/use-finance-accounts";
import { useListJkNavigation } from "../../lib/use-list-jk-navigation";

type Section = {
  title: string;
  data: FinanceAccountRow[];
};

export function FinanceAccountsPane() {
  const router = useRouter();
  const accounts = useFinanceAccounts();
  const { balances, reload: reloadBalances } = useBankAccountBalances();
  const avatarSrcById = useFinanceAccountAvatarSrcMap(accounts.rows);

  const sections = useMemo<Section[]>(
    () =>
      groupBankAccounts(accounts.rows).map((group) => ({
        title: group.label,
        data: group.accounts,
      })),
    [accounts.rows],
  );

  const totalCents = useMemo(
    () =>
      accounts.rows.reduce((sum, row) => sum + (balances[row.id] ?? 0), 0),
    [accounts.rows, balances],
  );

  const listRef = useRef<SectionList<FinanceAccountRow, Section>>(null);
  const itemIds = useMemo(
    () => sections.flatMap((section) => section.data.map((row) => row.id)),
    [sections],
  );
  const openAccount = useCallback(
    (id: string) => {
      rememberFinanceSection("accounts");
      router.push({ pathname: "/finance/account/[id]", params: { id } });
    },
    [router],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: openAccount,
    onHighlightChange: (id) => {
      if (!id || !listRef.current) return;
      const location = findSectionListLocation(sections, id);
      if (!location) return;
      try {
        listRef.current.scrollToLocation({
          ...location,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        // Ignore before layout.
      }
    },
  });

  if (accounts.loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (accounts.error) {
    return <Text style={ui.error}>{accounts.error}</Text>;
  }

  return (
    <View style={ui.screen}>
      <SectionList
        ref={listRef}
        style={ui.screen}
        sections={sections as SectionListData<FinanceAccountRow, Section>[]}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        alwaysBounceVertical
        refreshControl={
          <RefreshControl
            refreshing={accounts.pullRefreshing}
            onRefresh={() => {
              void accounts.reload();
              void reloadBalances();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
        ListHeaderComponent={
          <View>
            <ContentPageTitle
              title="Accounts"
              trailing={
                <TabStackHeaderPlusButton
                  accessibilityLabel="Create account"
                  onPress={() => router.push("/finance/account-form")}
                />
              }
            />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total balance</Text>
              <Text style={styles.totalValue}>{formatCents(totalCents)}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={ui.empty}>No accounts yet.</Text>}
        renderSectionHeader={({ section }) => (
          <Text style={ui.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const highlighted = highlightedId === item.id;
          const balance = balances[item.id];
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => openAccount(item.id)}
              style={({ pressed }) => [
                ui.row,
                styles.accountRow,
                highlighted ? ui.keyboardNavHighlight : null,
                pressed ? { backgroundColor: colors.rowPressed } : null,
              ]}
            >
              <FinanceAccountAvatar
                src={avatarSrcById[item.id] ?? null}
                name={item.name}
                size={28}
              />
              <View style={ui.rowBody}>
                <Text style={ui.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={ui.rowMeta} numberOfLines={1}>
                  {bankAccountTypeLabel(item.type)}
                  {item.ibanOrMask ? ` · ${item.ibanOrMask}` : ""}
                </Text>
              </View>
              <Text
                style={[
                  styles.balance,
                  balance != null && balance < 0
                    ? { color: colors.danger }
                    : null,
                ]}
              >
                {balance != null ? formatCents(balance, item.currency) : "—"}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  totalRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  totalValue: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  accountRow: {
    alignItems: "center",
    gap: 12,
  },
  balance: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
});
