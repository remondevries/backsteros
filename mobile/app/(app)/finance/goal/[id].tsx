import { useNavigation } from "expo-router/react-navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayoutEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ContentPageTitle } from "../../../../components/content-page-title";
import { TransactionList } from "../../../../components/finance/transaction-list";
import { goalProgressRatio } from "../../../../lib/finance-goals";
import { formatCents } from "../../../../lib/finance-format";
import { rememberFinanceSection } from "../../../../lib/finance-section-memory";
import { padAwareDetailHeaderOptions } from "../../../../lib/pad-aware-detail-header";
import { useFinanceDetailBack } from "../../../../lib/use-finance-detail-back";
import { colors, spacing } from "../../../../lib/theme";
import { useFinanceCategories } from "../../../../lib/use-finance-categories";
import { useFinanceGoals } from "../../../../lib/use-finance-goals";

export default function FinanceGoalScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const onBack = useFinanceDetailBack("goals");

  const goals = useFinanceGoals();
  const categories = useFinanceCategories();
  const goal = goals.rows.find((row) => row.id === id) ?? null;
  const ratio = goal ? goalProgressRatio(goal) : 0;
  const target = goal?.goalAmountCents ?? 0;

  useLayoutEffect(() => {
    rememberFinanceSection("goals");
    navigation.setOptions(
      padAwareDetailHeaderOptions({
        onBack,
      }),
    );
  }, [navigation, onBack]);

  const baseFilters = useMemo(() => ({ goalId: id }), [id]);

  return (
    <View style={styles.screen}>
      <ContentPageTitle
        title={goal?.name ?? "Goal"}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit goal"
            hitSlop={10}
            onPress={() =>
              router.push({
                pathname: "/finance/goal-form",
                params: { id },
              })
            }
          >
            <Text style={styles.editLabel}>Edit</Text>
          </Pressable>
        }
      />
      {goal ? (
        <View style={styles.hero}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
          </View>
          <Text style={styles.heroMeta}>
            {formatCents(goal.savedCents)}
            {target > 0 ? ` / ${formatCents(target)}` : ""}
          </Text>
        </View>
      ) : null}
      <TransactionList
        baseFilters={baseFilters}
        categories={categories.rows}
        emptyText="No transactions linked to this goal."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
  },
  hero: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  heroMeta: {
    color: colors.muted,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  editLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
});
