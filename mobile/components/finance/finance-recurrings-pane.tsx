import type { FlashListRef } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { categoryIconDisplay } from "../../lib/finance-categories";
import { formatCalendarDate, formatCents } from "../../lib/finance-format";
import {
  advanceMonthlyNextDate,
  groupRecurringsByDate,
} from "../../lib/finance-recurrings";
import { ContentPageTitle } from "../content-page-title";
import { rememberFinanceSection } from "../../lib/finance-section-memory";
import {
  findFlatGroupedRowIndex,
  flattenGroupedSections,
  type FlatGroupedRow,
} from "../../lib/lists/flatten-grouped-sections";
import { TabStackHeaderPlusButton } from "../../lib/tab-stack-options";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useFinanceCategories } from "../../lib/use-finance-categories";
import {
  useFinanceRecurrings,
  type FinanceRecurringRow,
} from "../../lib/use-finance-recurrings";
import { useListJkNavigation } from "../../lib/use-list-jk-navigation";
import { BacksterGroupedList } from "../lists/index";

type Section = {
  key: string;
  title: string;
  data: FinanceRecurringRow[];
};

export function FinanceRecurringsPane() {
  const router = useRouter();
  const recurrings = useFinanceRecurrings();
  const categories = useFinanceCategories();
  const categoryNameById = useMemo(
    () => new Map(categories.rows.map((row) => [row.id, row.name])),
    [categories.rows],
  );

  const sections = useMemo<Section[]>(
    () =>
      groupRecurringsByDate(recurrings.rows).map((group) => ({
        key: group.label,
        title: group.label,
        data: group.recurrings,
      })),
    [recurrings.rows],
  );

  const { rowIndexByItemId: flatMeta } = useMemo(
    () => flattenGroupedSections(sections),
    [sections],
  );

  const listRef = useRef<FlashListRef<FlatGroupedRow<FinanceRecurringRow>>>(null);
  const itemIds = useMemo(
    () => sections.flatMap((section) => section.data.map((row) => row.id)),
    [sections],
  );
  const openRecurring = useCallback(
    (id: string) => {
      rememberFinanceSection("recurrings");
      router.push({ pathname: "/finance/recurring/[id]", params: { id } });
    },
    [router],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: openRecurring,
    onHighlightChange: (id) => {
      if (!id || !listRef.current) return;
      const index = findFlatGroupedRowIndex(flatMeta, id);
      if (index == null) return;
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

  if (recurrings.loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (recurrings.error && recurrings.rows.length === 0) {
    return <Text style={ui.error}>{recurrings.error}</Text>;
  }

  return (
    <BacksterGroupedList
      ref={listRef}
      sections={sections}
      highlightedId={highlightedId}
      estimatedItemSize={56}
      estimatedHeaderSize={32}
      refreshing={recurrings.pullRefreshing}
      onRefresh={() => void recurrings.reload()}
      listHeader={
        <ContentPageTitle
          title="Recurrings"
          trailing={
            <TabStackHeaderPlusButton
              accessibilityLabel="Create recurring"
              onPress={() => router.push("/finance/recurring-form")}
            />
          }
        />
      }
      emptyText="No recurrings yet."
      renderSectionHeader={(section) => (
        <Text style={ui.sectionHeader}>{section.title}</Text>
      )}
      renderItem={(item, { highlighted }) => {
        const icon = categoryIconDisplay(item.icon);
        const next = advanceMonthlyNextDate(item.nextDate);
        const categoryName = item.categoryId
          ? (categoryNameById.get(item.categoryId) ?? null)
          : null;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => openRecurring(item.id)}
            style={({ pressed }) => [
              styles.row,
              highlighted ? ui.keyboardNavHighlight : null,
              pressed ? { backgroundColor: colors.rowPressed } : null,
            ]}
          >
            <View style={styles.leading}>
              {icon.emoji ? (
                <Text style={styles.emoji}>{icon.emoji}</Text>
              ) : (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: icon.color ?? colors.faint },
                  ]}
                />
              )}
            </View>
            <View style={styles.body}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[
                  next ? formatCalendarDate(next) : null,
                  categoryName,
                  item.amountCents != null
                    ? formatCents(item.amountCents)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: "transparent",
  },
  leading: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 18,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
});
