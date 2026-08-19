import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MonthNavigator } from "./month-navigator";
import { ContentPageTitle } from "../content-page-title";
import { fetchWorkspaceCashflow } from "../../lib/finance-api";
import {
  buildCategoryTree,
  categoryIconDisplay,
  type FinanceCategoryRow,
} from "../../lib/finance-categories";
import { rememberFinanceSection } from "../../lib/finance-section-memory";
import { currentMonthKey, formatCents } from "../../lib/finance-format";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { TabStackHeaderPlusButton } from "../../lib/tab-stack-options";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useFinanceCategories } from "../../lib/use-finance-categories";
import { useListJkNavigation } from "../../lib/use-list-jk-navigation";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";

type CategoryListRow = FinanceCategoryRow & {
  depth: number;
  /** Own spend + children rolled up (roots only). */
  spentCents: number;
};

export function FinanceCategoriesPane() {
  const router = useRouter();
  const client = useMobileApiClient();
  const categories = useFinanceCategories();

  const maxMonthKey = useMemo(() => currentMonthKey(), []);
  const [monthKey, setMonthKey] = useState(maxMonthKey);
  const [spentByCategoryId, setSpentByCategoryId] = useState<
    Record<string, number>
  >({});

  const spendEpochRef = useRef(0);
  const loadSpend = useCallback(async () => {
    const epoch = ++spendEpochRef.current;
    try {
      const year = Number(monthKey.slice(0, 4));
      const cashflow = await fetchWorkspaceCashflow(client, year);
      if (spendEpochRef.current !== epoch) return;
      const spent: Record<string, number> = {};
      for (const entry of cashflow.categoryMonths) {
        if (entry.month !== monthKey || entry.categoryId == null) continue;
        spent[entry.categoryId] =
          (spent[entry.categoryId] ?? 0) + entry.expenseCents;
      }
      setSpentByCategoryId(spent);
    } catch {
      // Tree still renders; the Spent column just goes stale.
    }
  }, [client, monthKey]);

  useEffect(() => {
    void loadSpend();
  }, [loadSpend]);

  const rows = useMemo<CategoryListRow[]>(() => {
    const tree = buildCategoryTree(categories.rows);
    const flattened: CategoryListRow[] = [];
    for (const root of tree) {
      const childrenSpend = root.children.reduce(
        (sum, child) => sum + (spentByCategoryId[child.id] ?? 0),
        0,
      );
      flattened.push({
        ...root,
        depth: 0,
        spentCents: (spentByCategoryId[root.id] ?? 0) + childrenSpend,
      });
      for (const child of root.children) {
        flattened.push({
          ...child,
          depth: 1,
          spentCents: spentByCategoryId[child.id] ?? 0,
        });
      }
    }
    return flattened;
  }, [categories.rows, spentByCategoryId]);

  const listRef = useRef<FlatList<CategoryListRow>>(null);
  const itemIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const openCategory = useCallback(
    (id: string) => {
      rememberFinanceSection("categories");
      router.push({ pathname: "/finance/category/[id]", params: { id } });
    },
    [router],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: openCategory,
    onHighlightChange: (_id, index) => {
      if (index < 0 || !listRef.current) return;
      try {
        listRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        // Ignore before layout.
      }
    },
  });

  if (categories.loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (categories.error) {
    return <Text style={ui.error}>{categories.error}</Text>;
  }

  return (
    <View style={ui.screen}>
      <FlatList
        ref={listRef}
        style={ui.screen}
        data={rows}
        keyExtractor={(item) => item.id}
        alwaysBounceVertical
        onScrollToIndexFailed={() => {}}
        refreshControl={
          <RefreshControl
            refreshing={categories.pullRefreshing}
            onRefresh={() => {
              void categories.reload();
              void loadSpend();
            }}
            tintColor={colors.muted}
            colors={[colors.muted]}
          />
        }
        contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
        ListHeaderComponent={
          <View>
            <ContentPageTitle
              title="Categories"
              trailing={
                <TabStackHeaderPlusButton
                  accessibilityLabel="Create category"
                  onPress={() => router.push("/finance/category-form")}
                />
              }
            />
            <View style={styles.monthRow}>
              <Text style={styles.monthLabel}>Spent</Text>
              <MonthNavigator
                monthKey={monthKey}
                onChange={setMonthKey}
                maxMonthKey={maxMonthKey}
              />
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={ui.empty}>No categories yet.</Text>}
        renderItem={({ item }) => {
          const highlighted = highlightedId === item.id;
          const icon = categoryIconDisplay(item.icon);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => openCategory(item.id)}
              style={({ pressed }) => [
                styles.row,
                { paddingLeft: spacing.screenX + item.depth * 20 },
                highlighted ? ui.keyboardNavHighlight : null,
                pressed ? { backgroundColor: colors.rowPressed } : null,
              ]}
            >
              {icon.emoji ? (
                <Text style={styles.iconEmoji}>{icon.emoji}</Text>
              ) : (
                <View
                  style={[
                    styles.iconDot,
                    { backgroundColor: icon.color ?? colors.faint },
                  ]}
                />
              )}
              <Text
                style={[
                  styles.name,
                  item.depth === 0 ? styles.nameRoot : null,
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text
                style={[
                  styles.spent,
                  item.spentCents > 0
                    ? styles.spentDebit
                    : item.spentCents < 0
                      ? styles.spentCredit
                      : styles.spentZero,
                ]}
              >
                {item.spentCents === 0
                  ? "—"
                  : formatCents(-item.spentCents)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  monthLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: spacing.screenX,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: "transparent",
  },
  iconDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  iconEmoji: {
    fontSize: 13,
    width: 18,
    textAlign: "center",
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 15,
  },
  nameRoot: {
    fontWeight: "600",
  },
  spent: {
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  spentDebit: {
    color: "#c45b5b",
  },
  spentCredit: {
    color: "#3f9d6e",
  },
  spentZero: {
    color: colors.muted,
  },
});
