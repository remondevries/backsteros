import type { FinanceAssetsDebtRange } from "@backsteros/contracts";
import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FinanceChartBoundary } from "./finance-chart-boundary";
import { AssetsDebtChart } from "./assets-debt-chart";
import { FinanceCard } from "./finance-card";
import { IncomeExpenseDailyChart } from "./income-expense-daily-chart";
import { MonthNavigator } from "./month-navigator";
import { ContentPageTitle } from "../content-page-title";
import { isPadDevice } from "../../lib/device";
import { categoryIconDisplay } from "../../lib/finance-categories";
import {
  assetsChangePercent,
  buildAssetsDebtChartPoints,
  buildDashboardTopCategories,
} from "../../lib/finance-chart-series";
import {
  currentMonthKey,
  formatCalendarDate,
  formatCents,
  formatSignedCents,
  transactionDisplayTitle,
} from "../../lib/finance-format";
import { goalProgressRatio } from "../../lib/finance-goals";
import { buildUpcomingRecurrings } from "../../lib/finance-recurrings";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { useFinanceDashboard } from "../../lib/use-finance-dashboard";
import { useFinanceGoals } from "../../lib/use-finance-goals";
import { useFinanceRecurrings } from "../../lib/use-finance-recurrings";

const ASSETS_RANGES: FinanceAssetsDebtRange[] = [
  "1W",
  "1M",
  "3M",
  "YTD",
  "1Y",
  "ALL",
];

function RangePills({
  value,
  onChange,
}: {
  value: FinanceAssetsDebtRange;
  onChange: (range: FinanceAssetsDebtRange) => void;
}) {
  return (
    <View style={styles.rangeRow}>
      {ASSETS_RANGES.map((range) => {
        const selected = range === value;
        return (
          <Pressable
            key={range}
            accessibilityRole="button"
            accessibilityState={selected ? { selected: true } : {}}
            accessibilityLabel={`Range ${range}`}
            hitSlop={4}
            onPress={() => onChange(range)}
            style={[
              styles.rangePill,
              selected ? styles.rangePillSelected : null,
            ]}
          >
            <Text
              style={[
                styles.rangeLabel,
                selected ? styles.rangeLabelSelected : null,
              ]}
            >
              {range}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CategoryMark({ icon }: { icon: string | null }) {
  const display = categoryIconDisplay(icon);
  if (display.emoji) {
    return <Text style={styles.markEmoji}>{display.emoji}</Text>;
  }
  return (
    <View
      style={[
        styles.markDot,
        { backgroundColor: display.color ?? colors.faint },
      ]}
    />
  );
}

type Props = {
  /** Opens the transactions section with the uncategorized filter. */
  onReviewAll?: () => void;
};

export function FinanceDashboardPane({ onReviewAll }: Props) {
  const isPad = isPadDevice();
  const maxMonthKey = useMemo(() => currentMonthKey(), []);
  const [monthKey, setMonthKey] = useState(maxMonthKey);
  const [assetsRange, setAssetsRange] =
    useState<FinanceAssetsDebtRange>("3M");

  const dashboard = useFinanceDashboard({ monthKey, assetsRange });
  const goals = useFinanceGoals();
  const recurrings = useFinanceRecurrings();

  const assetsChange = dashboard.assetsDebt
    ? assetsChangePercent(dashboard.assetsDebt)
    : null;
  const assetsPoints = useMemo(
    () =>
      dashboard.assetsDebt
        ? buildAssetsDebtChartPoints(dashboard.assetsDebt)
        : [],
    [dashboard.assetsDebt],
  );

  const topCategories = useMemo(
    () =>
      buildDashboardTopCategories({
        categories: dashboard.categories,
        categoryMonths: dashboard.categoryMonths,
        monthKey,
      }),
    [dashboard.categories, dashboard.categoryMonths, monthKey],
  );
  const topCategoriesTotal = useMemo(
    () =>
      topCategories
        .filter((row) => row.depth === 0)
        .reduce((sum, row) => sum + Math.abs(row.spentCents), 0),
    [topCategories],
  );

  const upcomingRecurrings = useMemo(
    () => buildUpcomingRecurrings(recurrings.rows),
    [recurrings.rows],
  );

  const activeGoals = useMemo(
    () =>
      [...goals.rows]
        .filter((goal) => goal.listing === "active")
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
    [goals.rows],
  );

  const refreshing =
    dashboard.refreshing || goals.pullRefreshing || recurrings.pullRefreshing;

  const reload = () => {
    void Promise.all([
      dashboard.reload(),
      goals.reload(),
      recurrings.reload(),
    ]);
  };

  if (dashboard.loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (dashboard.error && !dashboard.monthCashflow && !dashboard.categoryMonths.length) {
    return <Text style={ui.error}>{dashboard.error}</Text>;
  }

  const netCents = dashboard.monthCashflow
    ? dashboard.monthCashflow.incomeCents - dashboard.monthCashflow.expenseCents
    : null;

  const monthlySpending = (
    <FinanceCard title="Monthly spending">
      <FinanceChartBoundary>
      <IncomeExpenseDailyChart
        points={dashboard.monthIncomeExpensePoints}
        loading={dashboard.monthChartLoading}
      />
      </FinanceChartBoundary>
    </FinanceCard>
  );

  const reviewCard =
    dashboard.review && dashboard.review.total > 0 ? (
      <FinanceCard
        title={`Transactions to review · ${dashboard.review.total}`}
        trailing={
          onReviewAll ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review all uncategorized transactions"
              hitSlop={8}
              onPress={onReviewAll}
            >
              <Text style={styles.linkLabel}>Inbox</Text>
            </Pressable>
          ) : null
        }
      >
        <View style={styles.reviewList}>
          {dashboard.review.transactions.map((transaction) => (
            <View key={transaction.id} style={styles.reviewRow}>
              <View style={styles.reviewBody}>
                <Text style={styles.reviewTitle} numberOfLines={1}>
                  {transactionDisplayTitle(transaction)}
                </Text>
                <Text style={styles.reviewMeta}>
                  {formatCalendarDate(transaction.bookedOn)}
                </Text>
              </View>
              <Text
                style={[
                  styles.reviewAmount,
                  transaction.amountCents > 0 ? styles.amountPositive : null,
                ]}
              >
                {formatSignedCents(
                  transaction.amountCents,
                  transaction.currency,
                )}
              </Text>
            </View>
          ))}
        </View>
      </FinanceCard>
    ) : (
      <FinanceCard
        title="Transactions to review"
        trailing={
          onReviewAll ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review all uncategorized transactions"
              hitSlop={8}
              onPress={onReviewAll}
            >
              <Text style={styles.linkLabel}>Inbox</Text>
            </Pressable>
          ) : null
        }
      >
        <Text style={styles.emptyText}>Nothing left to review.</Text>
      </FinanceCard>
    );

  const netThisMonth = (
    <FinanceCard title="Net this month">
      {netCents != null ? (
        <>
          <Text
            style={[
              styles.bigNumber,
              netCents < 0 ? { color: colors.danger } : null,
            ]}
          >
            {formatSignedCents(netCents)}
          </Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Income</Text>
              <Text style={styles.metricValue}>
                {formatCents(dashboard.monthCashflow!.incomeCents)}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Expenses</Text>
              <Text style={styles.metricValue}>
                {formatCents(dashboard.monthCashflow!.expenseCents)}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.emptyText}>No activity this month.</Text>
      )}
    </FinanceCard>
  );

  const assetsCard = (
    <FinanceCard
      title="Amount of assets"
      trailing={<RangePills value={assetsRange} onChange={setAssetsRange} />}
    >
      {dashboard.assetsDebt ? (
        <>
          <View style={styles.assetsHeader}>
            <Text style={styles.bigNumber}>
              {formatCents(dashboard.assetsDebt.assetsCents)}
            </Text>
            {assetsChange != null ? (
              <Text
                style={[
                  styles.changeLabel,
                  assetsChange < 0 ? { color: colors.danger } : null,
                ]}
              >
                {assetsChange >= 0 ? "+" : ""}
                {assetsChange.toFixed(1)}%
              </Text>
            ) : null}
          </View>
          {dashboard.assetsDebt.debtCents > 0 ? (
            <Text style={styles.metricLabel}>
              Debt {formatCents(dashboard.assetsDebt.debtCents)}
            </Text>
          ) : null}
          <FinanceChartBoundary>
          <AssetsDebtChart points={assetsPoints} />
          </FinanceChartBoundary>
        </>
      ) : (
        <Text style={styles.emptyText}>Loading…</Text>
      )}
    </FinanceCard>
  );

  const topCategoriesCard = (
    <FinanceCard title="Top categories">
      {topCategories.length === 0 ? (
        <Text style={styles.emptyText}>
          No categorized spending this month.
        </Text>
      ) : (
        <View style={styles.categoryList}>
          {topCategories.map((row) => {
            const share =
              topCategoriesTotal > 0
                ? Math.min(1, Math.abs(row.spentCents) / topCategoriesTotal)
                : 0;
            const icon = categoryIconDisplay(row.icon);
            return (
              <View
                key={row.id}
                style={[
                  styles.categoryRow,
                  row.depth === 1 ? styles.categoryRowChild : null,
                ]}
              >
                <View style={styles.categoryLead}>
                  {icon.emoji ? (
                    <Text style={styles.markEmoji}>{icon.emoji}</Text>
                  ) : (
                    <View
                      style={[
                        styles.markDot,
                        { backgroundColor: icon.color ?? colors.faint },
                      ]}
                    />
                  )}
                  <Text style={styles.categoryName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={styles.categoryAmount}>
                    {formatCents(Math.abs(row.spentCents))}
                  </Text>
                </View>
                <View style={styles.categoryTrack}>
                  <View
                    style={[
                      styles.categoryFill,
                      {
                        width: `${share * 100}%`,
                        backgroundColor: icon.color ?? colors.muted,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </FinanceCard>
  );

  const upcomingCard = (
    <FinanceCard title="Next two weeks">
      {upcomingRecurrings.length === 0 ? (
        <Text style={styles.emptyText}>
          No recurrings due in the next two weeks.
        </Text>
      ) : (
        <View style={styles.listBlock}>
          {upcomingRecurrings.map((item) => (
            <View key={item.id} style={styles.listRow}>
              <Text style={styles.listDate}>
                {formatCalendarDate(item.paymentDate)}
              </Text>
              <CategoryMark icon={item.icon} />
              <Text style={styles.listLabel} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.listAmount}>
                {item.amountCents != null ? formatCents(item.amountCents) : "—"}
              </Text>
            </View>
          ))}
        </View>
      )}
    </FinanceCard>
  );

  const goalsCard = (
    <FinanceCard title="Goals">
      {activeGoals.length === 0 ? (
        <Text style={styles.emptyText}>No active goals.</Text>
      ) : (
        <View style={styles.listBlock}>
          {activeGoals.map((goal) => {
            const ratio = goalProgressRatio(goal);
            const target = goal.goalAmountCents ?? 0;
            const icon = categoryIconDisplay(goal.icon);
            return (
              <View key={goal.id} style={styles.goalBlock}>
                <View style={styles.listRow}>
                  <CategoryMark icon={goal.icon} />
                  <Text style={styles.listLabel} numberOfLines={1}>
                    {goal.name}
                  </Text>
                  <Text style={styles.listAmount}>
                    {target > 0
                      ? `${formatCents(goal.savedCents)} / ${formatCents(target)}`
                      : "—"}
                  </Text>
                </View>
                <View style={styles.goalTrack}>
                  <View
                    style={[
                      styles.goalFill,
                      {
                        width: `${ratio * 100}%`,
                        backgroundColor: icon.color ?? "#3f9d6e",
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </FinanceCard>
  );

  const primary: ReactNode = (
    <>
      {monthlySpending}
      {reviewCard}
      {netThisMonth}
    </>
  );

  const secondary: ReactNode = (
    <>
      {assetsCard}
      {topCategoriesCard}
      {upcomingCard}
      {goalsCard}
    </>
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
          refreshing={refreshing}
          onRefresh={reload}
          tintColor={colors.muted}
          colors={[colors.muted]}
        />
      }
    >
      <ContentPageTitle
        title="Dashboard"
        trailing={
          <MonthNavigator
            monthKey={monthKey}
            onChange={setMonthKey}
            maxMonthKey={maxMonthKey}
          />
        }
      />
      <View style={styles.page}>
        {isPad ? (
          <View style={styles.columns}>
            <View style={styles.column}>{primary}</View>
            <View style={styles.column}>{secondary}</View>
          </View>
        ) : (
          <View style={styles.stack}>
            {primary}
            {secondary}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: spacing.screenX,
    gap: 12,
  },
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 16,
  },
  stack: {
    gap: 12,
  },
  bigNumber: {
    color: colors.foreground,
    fontSize: 26,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  metricRow: {
    flexDirection: "row",
    gap: 24,
  },
  metric: {
    gap: 2,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  metricValue: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
  },
  linkLabel: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  reviewList: {
    gap: 10,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reviewBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  reviewTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  reviewMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  reviewAmount: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  amountPositive: {
    color: "#7fc8a9",
  },
  assetsHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  changeLabel: {
    color: "#7fc8a9",
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  rangeRow: {
    flexDirection: "row",
    gap: 2,
  },
  rangePill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
  },
  rangePillSelected: {
    backgroundColor: colors.faint,
  },
  rangeLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  rangeLabelSelected: {
    color: colors.foreground,
  },
  categoryList: {
    gap: 10,
  },
  categoryRow: {
    gap: 6,
  },
  categoryRowChild: {
    paddingLeft: 18,
  },
  categoryLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryName: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  categoryAmount: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  categoryTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.faint,
    overflow: "hidden",
  },
  categoryFill: {
    height: "100%",
    borderRadius: 999,
    opacity: 0.85,
  },
  listBlock: {
    gap: 10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listDate: {
    width: 72,
    color: colors.muted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  listLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  listAmount: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  goalBlock: {
    gap: 6,
  },
  goalTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.faint,
    overflow: "hidden",
  },
  goalFill: {
    height: "100%",
    borderRadius: 999,
  },
  markEmoji: {
    fontSize: 14,
  },
  markDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
