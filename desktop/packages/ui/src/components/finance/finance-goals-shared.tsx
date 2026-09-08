"use client";

import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialGoalListing,
  FinancialGoalSavingMode,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";

import { DEFAULT_ENTITY_ICON_COLOR } from "../../entity/entity-icon.js";
import { type FinanceListReorderRequest } from "../../finance/finance-list-reorder.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import type {
  FinanceCategoryOrganization,
  FinanceCategoryTransactionPatch,
} from "./finance-categories-view.js";
import {
  getDisplayProjectIcon,
  getEntityIconColor,
  ProjectOcticon,
} from "../projects/project-octicon.js";

export type FinanceGoalsChromeState = {
  hasSelection: boolean;
  detailCollapsed: boolean;
  detailResized: boolean;
  onToggleDetail: () => void;
  goal: FinancialGoal;
  currentListing: FinancialGoalListing;
  onSetListing: (listing: FinancialGoalListing) => void;
  onDelete: () => void | Promise<void>;
};

export type FinanceGoalCreateInput = {
  name: string;
  listing: FinancialGoalListing;
};

export type FinanceGoalUpdateInput = {
  name?: string;
  listing?: FinancialGoalListing;
  icon?: string | null;
  goalAmountCents?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  contributionCents?: number | null;
  savingMode?: FinancialGoalSavingMode;
  sortOrder?: number;
};

export type FinanceGoalsViewProps = {
  goals: FinancialGoal[];
  pending?: boolean;
  error?: string | null;
  /** Linked transactions for the selected goal (drives actual chart series). */
  selectedGoalTransactions?: FinancialTransaction[];
  selectedGoalTransactionsLoading?: boolean;
  /** Current calendar month income across all accounts (full pie total). */
  monthIncomeCents?: number;
  categories?: FinancialCategory[];
  accounts?: BankAccount[];
  accountAvatarSrcById?: Record<string, string>;
  organizations?: FinanceCategoryOrganization[];
  /** Recurrings available to link from goal transactions. */
  recurrings?: FinancialRecurring[];
  onPatchTransaction?: (
    id: string,
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkPatchTransactions?: (
    ids: string[],
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkDeleteTransactions?: (ids: string[]) => void | Promise<void>;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
  onChromeStateChange?: (state: FinanceGoalsChromeState | null) => void;
  onCreate: (input: FinanceGoalCreateInput) => void | Promise<void>;
  onUpdate: (id: string, patch: FinanceGoalUpdateInput) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  /** Persist list order (and listing when dropped across groups). */
  onReorder?: (request: FinanceListReorderRequest) => void;
  /** Notifies the host when the selected goal changes (to load linked txs). */
  onSelectedGoalChange?: (goalId: string | null) => void;
};

export function normalizeListing(
  value: string | null | undefined,
): FinancialGoalListing {
  if (value === "ready_to_spend" || value === "archive") return value;
  return "active";
}

export function normalizeSavingMode(
  value: string | null | undefined,
): FinancialGoalSavingMode {
  if (value === "daily" || value === "weekly" || value === "yearly") {
    return value;
  }
  return "monthly";
}

export function formatMoney(cents: number): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `€${value.toFixed(0)}`;
  }
}

export function formatGoalCell(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "—";
  return formatMoney(cents);
}

export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Projected savings from start date + contribution + mode, capped at goal.
 */
export function computeGoalSavedCents(
  goal: Pick<
    FinancialGoal,
    "goalAmountCents" | "startDate" | "contributionCents" | "savingMode"
  >,
  asOf: Date = new Date(),
): number {
  const contribution =
    goal.contributionCents != null && goal.contributionCents > 0
      ? goal.contributionCents
      : 0;
  if (contribution <= 0) return 0;
  const start = parseCalendarDate(goal.startDate);
  if (!start) return 0;
  const today = startOfLocalDay(asOf);
  const startDay = startOfLocalDay(start);
  if (startDay > today) return 0;

  const mode = normalizeSavingMode(goal.savingMode);
  let periods: number;
  if (mode === "daily") {
    periods =
      Math.floor((today.getTime() - startDay.getTime()) / 86_400_000) + 1;
  } else if (mode === "weekly") {
    periods =
      Math.floor((today.getTime() - startDay.getTime()) / (7 * 86_400_000)) + 1;
  } else if (mode === "yearly") {
    periods = today.getFullYear() - startDay.getFullYear() + 1;
    const anniversary = new Date(
      today.getFullYear(),
      startDay.getMonth(),
      startDay.getDate(),
    );
    if (today < anniversary) periods -= 1;
    periods = Math.max(1, periods);
  } else {
    periods =
      (today.getFullYear() - startDay.getFullYear()) * 12 +
      (today.getMonth() - startDay.getMonth()) +
      1;
  }

  const saved = Math.max(0, periods) * contribution;
  const goalAmount =
    goal.goalAmountCents != null && goal.goalAmountCents > 0
      ? goal.goalAmountCents
      : null;
  return goalAmount == null ? saved : Math.min(goalAmount, saved);
}

/** True when an active goal has reached its target and should move to Ready to spend. */
export function shouldPromoteGoalToReadyToSpend(
  goal: Pick<FinancialGoal, "listing" | "goalAmountCents">,
  savedCents: number,
): boolean {
  if (normalizeListing(goal.listing) !== "active") return false;
  const amount = goal.goalAmountCents;
  if (amount == null || amount <= 0) return false;
  return savedCents >= amount;
}

/**
 * Next listing based on *actual* tagged savings vs goal amount.
 * Returns null when no automatic change is needed. Never touches archive.
 */
export function nextGoalListingForSavings(
  goal: Pick<FinancialGoal, "listing" | "goalAmountCents">,
  savedCents: number,
): FinancialGoalListing | null {
  const listing = normalizeListing(goal.listing);
  if (listing === "archive") return null;
  const amount = goal.goalAmountCents;
  if (amount == null || amount <= 0) return null;
  const saved = Math.max(0, savedCents);
  if (saved >= amount && listing === "active") return "ready_to_spend";
  if (saved < amount && listing === "ready_to_spend") return "active";
  return null;
}

/** Actual tagged savings for a goal (falls back to 0). */
export function resolveGoalSavedCents(
  goal: Pick<FinancialGoal, "savedCents">,
): number {
  return Math.max(0, goal.savedCents ?? 0);
}

export function GoalIcon({
  icon,
  size = 16,
}: {
  icon: string | null | undefined;
  size?: number;
}) {
  const color = getEntityIconColor(icon);
  const display = getDisplayProjectIcon(icon);
  if (!display) {
    return (
      <DefaultProjectIcon
        size={size}
        style={color ? { color } : undefined}
      />
    );
  }
  return (
    <ProjectOcticon
      icon={icon}
      size={size}
      style={{ color: color ?? DEFAULT_ENTITY_ICON_COLOR }}
    />
  );
}
