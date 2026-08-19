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

import { categoryIconDisplay } from "../../lib/finance-categories";
import { formatCalendarDate, formatCents } from "../../lib/finance-format";
import {
  advanceMonthlyNextDate,
  groupRecurringsByDate,
} from "../../lib/finance-recurrings";
import { ContentPageTitle } from "../content-page-title";
import { rememberFinanceSection } from "../../lib/finance-section-memory";
import { findSectionListLocation } from "../../lib/list-keyboard-nav";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { TabStackHeaderPlusButton } from "../../lib/tab-stack-options";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useFinanceCategories } from "../../lib/use-finance-categories";
import {
  useFinanceRecurrings,
  type FinanceRecurringRow,
} from "../../lib/use-finance-recurrings";
import { useListJkNavigation } from "../../lib/use-list-jk-navigation";

type Section = {
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
        title: group.label,
        data: group.recurrings,
      })),
    [recurrings.rows],
  );

  const listRef = useRef<SectionList<FinanceRecurringRow, Section>>(null);
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
    <SectionList
      ref={listRef}
      style={ui.screen}
      sections={sections as SectionListData<FinanceRecurringRow, Section>[]}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      onScrollToIndexFailed={() => {}}
      refreshControl={
        <RefreshControl
          refreshing={recurrings.pullRefreshing}
          onRefresh={() => void recurrings.reload()}
          tintColor={colors.muted}
          colors={[colors.muted]}
        />
      }
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
      ListHeaderComponent={
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
      ListEmptyComponent={<Text style={ui.empty}>No recurrings yet.</Text>}
      renderSectionHeader={({ section }) => (
        <Text style={ui.sectionHeader}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
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
              highlightedId === item.id ? ui.keyboardNavHighlight : null,
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
