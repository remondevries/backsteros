import type { FinancialGoalListing } from "@backsteros/contracts";

import type { FinanceGoalRow } from "./use-finance-goals";

export const GOAL_LISTING_ORDER: readonly FinancialGoalListing[] = [
  "active",
  "ready_to_spend",
  "archive",
] as const;

export const GOAL_LISTING_LABELS: Record<FinancialGoalListing, string> = {
  active: "Active",
  ready_to_spend: "Ready to spend",
  archive: "Archive",
};

export type GoalListingGroup = {
  id: FinancialGoalListing;
  label: string;
  goals: FinanceGoalRow[];
};

/** Group goals by listing for SectionList (desktop Goals view parity). */
export function groupGoalsByListing(
  goals: readonly FinanceGoalRow[],
): GoalListingGroup[] {
  const buckets: Record<FinancialGoalListing, FinanceGoalRow[]> = {
    active: [],
    ready_to_spend: [],
    archive: [],
  };
  for (const goal of goals) {
    buckets[goal.listing].push(goal);
  }
  for (const listing of GOAL_LISTING_ORDER) {
    buckets[listing].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
  }
  return GOAL_LISTING_ORDER.map((id) => ({
    id,
    label: GOAL_LISTING_LABELS[id],
    goals: buckets[id],
  })).filter((group) => group.goals.length > 0);
}

export function goalProgressRatio(goal: FinanceGoalRow): number {
  const target = goal.goalAmountCents ?? 0;
  if (target <= 0) return 0;
  return Math.min(1, Math.max(0, goal.savedCents / target));
}
