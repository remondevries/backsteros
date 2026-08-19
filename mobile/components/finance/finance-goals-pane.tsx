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

import {
  categoryIconDisplay,
} from "../../lib/finance-categories";
import {
  goalProgressRatio,
  groupGoalsByListing,
} from "../../lib/finance-goals";
import { ContentPageTitle } from "../content-page-title";
import { formatCents } from "../../lib/finance-format";
import { rememberFinanceSection } from "../../lib/finance-section-memory";
import { findSectionListLocation } from "../../lib/list-keyboard-nav";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { TabStackHeaderPlusButton } from "../../lib/tab-stack-options";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import {
  useFinanceGoals,
  type FinanceGoalRow,
} from "../../lib/use-finance-goals";
import { useListJkNavigation } from "../../lib/use-list-jk-navigation";

type Section = {
  title: string;
  data: FinanceGoalRow[];
};

export function FinanceGoalsPane() {
  const router = useRouter();
  const goals = useFinanceGoals();

  const sections = useMemo<Section[]>(
    () =>
      groupGoalsByListing(goals.rows).map((group) => ({
        title: group.label,
        data: group.goals,
      })),
    [goals.rows],
  );

  const listRef = useRef<SectionList<FinanceGoalRow, Section>>(null);
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
    <SectionList
      ref={listRef}
      style={ui.screen}
      sections={sections as SectionListData<FinanceGoalRow, Section>[]}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      onScrollToIndexFailed={() => {}}
      refreshControl={
        <RefreshControl
          refreshing={goals.pullRefreshing}
          onRefresh={() => void goals.reload()}
          tintColor={colors.muted}
          colors={[colors.muted]}
        />
      }
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE }}
      ListHeaderComponent={
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
      ListEmptyComponent={<Text style={ui.empty}>No goals yet.</Text>}
      renderSectionHeader={({ section }) => (
        <Text style={ui.sectionHeader}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
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
