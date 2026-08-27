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
import {
  goalProgressRatio,
  groupGoalsByListing,
} from "../../lib/finance-goals";
import { ContentPageTitle } from "../content-page-title";
import { formatCents } from "../../lib/finance-format";
import { rememberFinanceSection } from "../../lib/finance-section-memory";
import {
  findFlatGroupedRowIndex,
  flattenGroupedSections,
  type FlatGroupedRow,
} from "../../lib/lists/flatten-grouped-sections";
import { TabStackHeaderPlusButton } from "../../lib/tab-stack-options";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import {
  useFinanceGoals,
  type FinanceGoalRow,
} from "../../lib/use-finance-goals";
import { useListJkNavigation } from "../../lib/use-list-jk-navigation";
import { BacksterGroupedList } from "../lists/index";

type Section = {
  key: string;
  title: string;
  data: FinanceGoalRow[];
};

export function FinanceGoalsPane() {
  const router = useRouter();
  const goals = useFinanceGoals();

  const sections = useMemo<Section[]>(
    () =>
      groupGoalsByListing(goals.rows).map((group) => ({
        key: group.label,
        title: group.label,
        data: group.goals,
      })),
    [goals.rows],
  );

  const { rowIndexByItemId: flatMeta } = useMemo(
    () => flattenGroupedSections(sections),
    [sections],
  );

  const listRef = useRef<FlashListRef<FlatGroupedRow<FinanceGoalRow>>>(null);
  const itemIds = useMemo(
    () => sections.flatMap((section) => section.data.map((row) => row.id)),
    [sections],
  );
  const openGoal = useCallback(
    (id: string) => {
      rememberFinanceSection("goals");
      router.push({ pathname: "/finance/goal/[id]", params: { id } });
    },
    [router],
  );
  const { highlightedId } = useListJkNavigation({
    itemIds,
    onActivate: openGoal,
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

  if (goals.loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (goals.error && goals.rows.length === 0) {
    return <Text style={ui.error}>{goals.error}</Text>;
  }

  return (
    <BacksterGroupedList
      ref={listRef}
      sections={sections}
      highlightedId={highlightedId}
      estimatedItemSize={72}
      estimatedHeaderSize={32}
      refreshing={goals.pullRefreshing}
      onRefresh={() => void goals.reload()}
      listHeader={
        <ContentPageTitle
          title="Goals"
          trailing={
            <TabStackHeaderPlusButton
              accessibilityLabel="Create goal"
              onPress={() => router.push("/finance/goal-form")}
            />
          }
        />
      }
      emptyText="No goals yet."
      renderSectionHeader={(section) => (
        <Text style={ui.sectionHeader}>{section.title}</Text>
      )}
      renderItem={(item, { highlighted }) => {
        const icon = categoryIconDisplay(item.icon);
        const ratio = goalProgressRatio(item);
        const target = item.goalAmountCents ?? 0;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => openGoal(item.id)}
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
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {formatCents(item.savedCents)}
                {target > 0 ? ` / ${formatCents(target)}` : ""}
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
    gap: 6,
  },
  name: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
});
