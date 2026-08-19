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
import type { ReactNode } from "react";
import { CheckIcon, ChevronLeftIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_ENTITY_ICON_COLOR,
  ENTITY_ICON_COLOR_PRESETS,
} from "../entity-icon.js";
import {
  applyOptimisticGoalReorder,
  financeGoalGroupAppendOrderKey,
  financeGoalGroupKey,
  financeGoalOrderKey,
  type FinanceListReorderRequest,
} from "../finance-list-reorder.js";
import {
  formatMoneyInput,
  moneyCentsToInput,
  moneyInputContentWidth,
  parseMoneyInput,
} from "../money-input.js";
import { useFinanceMoneyColumnWidthFromValues } from "../finance-money-column-width.js";
import { useFinancePanelResize } from "../use-finance-panel-resize.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerItemBind,
} from "../use-grouped-list-pointer-reorder.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../keyboard-nav-item.js";
import {
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  LIST_KEYBOARD_NAV_ZONE_MAIN,
} from "../list-keyboard-nav-zone.js";
import {
  ENTITY_TITLE_INPUT_ATTRIBUTE,
  useListDismissDetailShortcut,
} from "../use-list-clear-selection-shortcut.js";
import {
  focusAndSelectTitleInput,
  useTitleRenameShortcut,
} from "../title-rename-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { useEntityHeaderActionsContext } from "./entity-actions/entity-header-actions-context.js";
import { EntityDetailLayout } from "./entity-detail-layout.js";
import { EntityIconPicker } from "./entity-icon-picker.js";
import {
  FinanceTransactionsPanelList,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
} from "./finance-categories-view.js";
import { FinanceDetailSectionTitle } from "./finance-detail-section-title.js";
import {
  FinanceOverviewPie,
  type FinanceOverviewPieSlice,
} from "./finance-overview-pie.js";
import { GoalProgressChart } from "./goal-progress-chart.js";
import {
  getDisplayProjectIcon,
  getEntityIconColor,
  ProjectOcticon,
} from "./project-octicon.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "./searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";
import {
  deriveContributionCents,
  deriveEndDate,
} from "../goal-plan.js";

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

const GOALS_PIE_REMAINDER_COLOR =
  "color-mix(in srgb, var(--foreground) 14%, transparent)";

const LISTING_OPTIONS: Array<{
  value: FinancialGoalListing;
  label: string;
  detailLabel: string;
}> = [
  { value: "active", label: "Active", detailLabel: "Active goal" },
  {
    value: "ready_to_spend",
    label: "Ready to spend",
    detailLabel: "Ready to spend",
  },
  { value: "archive", label: "Archive", detailLabel: "Archived goal" },
];

const SAVING_MODE_OPTIONS: Array<{
  value: FinancialGoalSavingMode;
  label: string;
  contributionLabel: string;
}> = [
  { value: "daily", label: "Daily", contributionLabel: "Daily contribution" },
  {
    value: "weekly",
    label: "Weekly",
    contributionLabel: "Weekly contribution",
  },
  {
    value: "monthly",
    label: "Monthly",
    contributionLabel: "Monthly contribution",
  },
  {
    value: "yearly",
    label: "Yearly",
    contributionLabel: "Yearly contribution",
  },
];

const FINANCE_GOAL_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-goals-detail-width";

const GOAL_ACTIONS_MENU_GAP = 6;
const GOAL_ACTIONS_VIEWPORT_PADDING = 8;
const GOAL_ACTIONS_MIN_WIDTH = 220;

type ListingGroup = {
  id: FinancialGoalListing;
  label: string;
  goals: FinancialGoal[];
  count: number;
};

function normalizeListing(
  value: string | null | undefined,
): FinancialGoalListing {
  if (value === "ready_to_spend" || value === "archive") return value;
  return "active";
}

function normalizeSavingMode(
  value: string | null | undefined,
): FinancialGoalSavingMode {
  if (value === "daily" || value === "weekly" || value === "yearly") {
    return value;
  }
  return "monthly";
}

function contributionLabelForMode(mode: FinancialGoalSavingMode): string {
  return (
    SAVING_MODE_OPTIONS.find((option) => option.value === mode)
      ?.contributionLabel ?? "Monthly contribution"
  );
}

function formatMoney(cents: number): string {
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

function formatGoalCell(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "—";
  return formatMoney(cents);
}

function parsePositiveMoneyInput(raw: string): number | null {
  return parseMoneyInput(raw, { positive: true });
}

function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfLocalDay(date: Date): Date {
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
  let periods = 0;
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

function goalProgressTone(savedCents: number, goalAmountCents: number) {
  const ratio = savedCents / goalAmountCents;
  if (ratio >= 1) return "ok";
  if (ratio >= 0.75) return "warn";
  return "low";
}

type GoalYearMetric = {
  year: number;
  /** Contributions booked in this calendar year only. */
  savedInYearCents: number;
};

function buildGoalYearMetrics(
  transactions: FinancialTransaction[],
): GoalYearMetric[] {
  const yearTotals = new Map<number, number>();
  for (const tx of transactions) {
    if (!tx.bookedOn || tx.bookedOn.length < 4) continue;
    const year = Number(tx.bookedOn.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    yearTotals.set(year, (yearTotals.get(year) ?? 0) + tx.amountCents);
  }
  return [...yearTotals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, cents]) => ({
      year,
      savedInYearCents: Math.max(0, cents),
    }));
}

/** 0-based index of the last contribution on or before `asOf` (−1 if none). */
function goalPeriodIndexOnOrBefore(
  start: Date,
  asOf: Date,
  mode: FinancialGoalSavingMode,
): number {
  const startDay = startOfLocalDay(start);
  const day = startOfLocalDay(asOf);
  if (day < startDay) return -1;
  if (mode === "daily") {
    return Math.floor((day.getTime() - startDay.getTime()) / 86_400_000);
  }
  if (mode === "weekly") {
    return Math.floor(
      (day.getTime() - startDay.getTime()) / (7 * 86_400_000),
    );
  }
  if (mode === "yearly") {
    let periods = day.getFullYear() - startDay.getFullYear();
    const anniversary = new Date(
      day.getFullYear(),
      startDay.getMonth(),
      startDay.getDate(),
    );
    if (day < anniversary) periods -= 1;
    return Math.max(0, periods);
  }
  return (
    (day.getFullYear() - startDay.getFullYear()) * 12 +
    (day.getMonth() - startDay.getMonth())
  );
}

function plannedContributionCentsForYear(
  year: number,
  contributionCents: number | null | undefined,
  savingMode: FinancialGoalSavingMode,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (contributionCents == null || contributionCents <= 0) return null;
  const start = parseCalendarDate(startDate);
  if (!start) return null;

  const end = parseCalendarDate(endDate);
  let rangeEnd = new Date(year, 11, 31);
  if (end && end < rangeEnd) rangeEnd = end;
  if (year === asOf.getFullYear()) {
    const today = startOfLocalDay(asOf);
    if (today < rangeEnd) rangeEnd = today;
  } else if (year > asOf.getFullYear()) {
    return null;
  }

  const dayBeforeYear = new Date(year, 0, 0); // 31 Dec of previous year
  const throughEnd = goalPeriodIndexOnOrBefore(start, rangeEnd, savingMode);
  const throughBefore = goalPeriodIndexOnOrBefore(
    start,
    dayBeforeYear,
    savingMode,
  );
  const countThroughEnd = throughEnd >= 0 ? throughEnd + 1 : 0;
  const countThroughBefore = throughBefore >= 0 ? throughBefore + 1 : 0;
  const periods = Math.max(0, countThroughEnd - countThroughBefore);
  return periods * contributionCents;
}

function GoalKeyMetrics({
  transactions,
  contributionCents,
  savingMode,
  startDate,
  endDate,
  loading,
  savedCents,
  goalAmountCents,
}: {
  transactions: FinancialTransaction[];
  contributionCents: number | null | undefined;
  savingMode: FinancialGoalSavingMode;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  loading: boolean;
  savedCents: number;
  goalAmountCents: number | null | undefined;
}) {
  const rows = useMemo(() => {
    const asOf = new Date();
    const yearTotals = buildGoalYearMetrics(transactions);
    const years = new Set(yearTotals.map((entry) => entry.year));
    const start = parseCalendarDate(startDate);
    if (start) {
      const lastYear = Math.min(
        asOf.getFullYear(),
        parseCalendarDate(endDate)?.getFullYear() ?? asOf.getFullYear(),
      );
      for (let year = start.getFullYear(); year <= lastYear; year += 1) {
        years.add(year);
      }
    } else if (
      years.size === 0 &&
      contributionCents != null &&
      contributionCents > 0
    ) {
      years.add(asOf.getFullYear());
    }

    const savedInYear = new Map(
      yearTotals.map((entry) => [entry.year, entry.savedInYearCents] as const),
    );
    const ascending = [...years].sort((a, b) => a - b);
    let savedSoFar = 0;
    const cumulative = ascending.map((year) => {
      savedSoFar += savedInYear.get(year) ?? 0;
      return {
        year,
        savedSoFarCents: savedSoFar,
        contributionCents: plannedContributionCentsForYear(
          year,
          contributionCents,
          savingMode,
          startDate,
          endDate,
          asOf,
        ),
      };
    });
    return cumulative.sort((a, b) => b.year - a.year);
  }, [
    contributionCents,
    endDate,
    savingMode,
    startDate,
    transactions,
  ]);

  const hasGoal = goalAmountCents != null && goalAmountCents > 0;
  const ratio = hasGoal
    ? Math.min(1, Math.max(0, savedCents / goalAmountCents))
    : 0;

  return (
    <section className="finance-categories-view__metrics finance-goals-view__metrics">
      <div
        className={[
          "finance-goals-view__progress-divider",
          !hasGoal ? "is-empty" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasGoal ? Math.round(ratio * 100) : 0}
        aria-label={
          hasGoal
            ? `${Math.round(ratio * 100)}% of goal saved`
            : "No goal amount"
        }
      >
        <span
          className="finance-goals-view__progress-divider-fill"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <FinanceDetailSectionTitle>Key metrics</FinanceDetailSectionTitle>
      <div className="finance-categories-view__metrics-head">
        <span className="finance-categories-view__metrics-col finance-categories-view__metrics-col--start">
          Year
        </span>
        <span className="finance-categories-view__metrics-col">
          Saved so far
        </span>
        <span className="finance-categories-view__metrics-col">
          Contribution
        </span>
      </div>
      {rows.length ? (
        rows.map((entry) => (
          <div
            key={entry.year}
            className="finance-categories-view__metrics-row"
          >
            <span className="finance-categories-view__metrics-year">
              {entry.year}
            </span>
            <span className="finance-categories-view__metrics-value">
              {formatMoney(entry.savedSoFarCents)}
            </span>
            <span className="finance-categories-view__metrics-value">
              {entry.contributionCents != null
                ? formatMoney(entry.contributionCents)
                : "—"}
            </span>
          </div>
        ))
      ) : (
        <div className="finance-categories-view__metrics-empty">
          {loading ? "Loading metrics…" : "No savings recorded yet."}
        </div>
      )}
    </section>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M8 3.5V12.5M3.5 8H12.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoalIcon({
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

function goalColor(icon: string | null | undefined): string {
  return getEntityIconColor(icon) ?? DEFAULT_ENTITY_ICON_COLOR;
}

function buildListingGroups(goals: FinancialGoal[]): ListingGroup[] {
  const sorted = [...goals].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const makeGroup = (
    id: FinancialGoalListing,
    label: string,
  ): ListingGroup => {
    const rows = sorted.filter((row) => normalizeListing(row.listing) === id);
    return { id, label, goals: rows, count: rows.length };
  };
  return [
    makeGroup("active", "Active"),
    makeGroup("ready_to_spend", "Ready to spend"),
    makeGroup("archive", "Archive"),
  ];
}

function GoalsOverviewCard({
  savedCents,
  goalAmountCents,
  slices,
}: {
  savedCents: number;
  goalAmountCents: number;
  slices: FinanceOverviewPieSlice[];
}) {
  return (
    <div
      className="finance-categories-view__overview"
      aria-label="Goals overview"
    >
      <div className="finance-categories-view__overview-stat finance-categories-view__overview-stat--spent">
        <span className="finance-categories-view__overview-value">
          {formatMoney(savedCents)}
        </span>
        <span className="finance-categories-view__overview-label">saved</span>
      </div>
      <FinanceOverviewPie slices={slices} />
      <div className="finance-categories-view__overview-stat finance-categories-view__overview-stat--budget">
        <span className="finance-categories-view__overview-value">
          {formatMoney(goalAmountCents)}
        </span>
        <span className="finance-categories-view__overview-label">
          total goals
        </span>
      </div>
    </div>
  );
}

function GoalAmountColumns({
  savedCents,
  goalAmountCents,
}: {
  savedCents: number;
  goalAmountCents: number | null | undefined;
}) {
  const hasGoal = goalAmountCents != null && goalAmountCents > 0;
  const ratio = hasGoal
    ? Math.min(1, Math.max(0, savedCents / goalAmountCents))
    : 0;
  const tone = hasGoal ? goalProgressTone(savedCents, goalAmountCents) : null;

  return (
    <span className="finance-categories-view__amounts">
      <span className="finance-categories-view__amount finance-categories-view__amount--spent">
        {formatMoney(savedCents)}
      </span>
      <span
        className={[
          "finance-categories-view__progress",
          tone ? `finance-categories-view__progress--${tone}` : null,
        ]
          .filter(Boolean)
          .join(" ")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasGoal ? Math.round(ratio * 100) : 0}
        aria-label={
          hasGoal
            ? `${Math.round((savedCents / goalAmountCents) * 100)}% of goal saved`
            : "No goal amount"
        }
      >
        <span
          className="finance-categories-view__progress-fill"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
      <span className="finance-categories-view__amount finance-categories-view__amount--budget">
        {formatGoalCell(goalAmountCents)}
      </span>
    </span>
  );
}

export function GoalActionsMenu({
  currentListing,
  onSetListing,
  onDelete,
  disabled = false,
}: {
  currentListing: FinancialGoalListing;
  onSetListing: (listing: FinancialGoalListing) => void;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { openDeleteModal } = useEntityHeaderActionsContext();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"listing" | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 48;
    const spaceBelow =
      window.innerHeight -
      rect.bottom -
      GOAL_ACTIONS_MENU_GAP -
      GOAL_ACTIONS_VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight &&
      rect.top > panelHeight + GOAL_ACTIONS_MENU_GAP;
    const top = openUpward
      ? Math.max(
          GOAL_ACTIONS_VIEWPORT_PADDING,
          rect.top - panelHeight - GOAL_ACTIONS_MENU_GAP,
        )
      : rect.bottom + GOAL_ACTIONS_MENU_GAP;
    setPanelStyle({
      position: "fixed",
      top: `${top}px`,
      right: `${Math.max(
        GOAL_ACTIONS_VIEWPORT_PADDING,
        window.innerWidth - rect.right,
      )}px`,
      left: "auto",
      width: "max-content",
      minWidth: `${GOAL_ACTIONS_MIN_WIDTH}px`,
      maxWidth: `calc(100vw - ${GOAL_ACTIONS_VIEWPORT_PADDING * 2}px)`,
      visibility: "visible",
      zIndex: 1000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, submenu, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      updatePosition();
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSubmenu((current) => {
        if (current) return null;
        setOpen(false);
        return null;
      });
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setSubmenu(null);
  }, [open]);

  const closeMenu = () => setOpen(false);

  let panelBody: ReactNode;
  if (submenu === "listing") {
    panelBody = (
      <>
        <button
          type="button"
          className="finance-categories-menu__back"
          onClick={() => setSubmenu(null)}
        >
          <ChevronLeftIcon size={14} />
          <span>Goal status</span>
        </button>
        <div className="finance-categories-menu__section">
          {LISTING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={currentListing === option.value}
              className="finance-categories-menu__item"
              onClick={() => {
                onSetListing(option.value);
                closeMenu();
              }}
            >
              <span>{option.detailLabel}</span>
              {currentListing === option.value ? (
                <CheckIcon size={14} />
              ) : null}
            </button>
          ))}
        </div>
      </>
    );
  } else {
    panelBody = (
      <>
        <div className="finance-categories-menu__section">
          <button
            type="button"
            className="finance-categories-menu__item finance-categories-menu__item--drill"
            onClick={() => setSubmenu("listing")}
          >
            <span>Status</span>
            <span className="finance-categories-menu__meta">
              {LISTING_OPTIONS.find((option) => option.value === currentListing)
                ?.label ?? "Active"}
            </span>
          </button>
        </div>
        <div className="finance-categories-menu__section">
          <button
            type="button"
            className="finance-categories-menu__item finance-categories-menu__item--danger"
            onClick={() => {
              closeMenu();
              openDeleteModal({
                entityLabel: "goal",
                confirmLabel: "Delete goal",
                onDelete: async () => {
                  try {
                    await Promise.resolve(onDelete());
                    return { ok: true };
                  } catch (reason) {
                    return {
                      ok: false,
                      error:
                        reason instanceof Error
                          ? reason.message
                          : "Could not delete goal.",
                    };
                  }
                },
              });
            }}
          >
            Delete goal
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="entity-header-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        ···
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              role="menu"
              className="finance-categories-menu"
              style={panelStyle}
            >
              {panelBody}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type CreateModalState = { listing: FinancialGoalListing } | null;

function CreateGoalModal({
  state,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  state: CreateModalState;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const titleId = useId();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!state) return;
    setName("");
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, state]);

  if (!state) return null;

  const listingLabel =
    LISTING_OPTIONS.find((option) => option.value === state.listing)?.label ??
    "Active";
  const title = `Add ${listingLabel.toLowerCase()} goal`;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-finance-goal-create-modal=""
    >
      <button
        type="button"
        aria-label="Cancel"
        className="entity-delete-modal-backdrop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-delete-modal finance-bank-account-modal"
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <form
          className="finance-bank-account-modal__form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed || pending) return;
            void onSubmit(trimmed);
          }}
        >
          <div className="finance-bank-account-modal__body">
            <p className="finance-categories-view__create-title">{title}</p>
            <label className="finance-bank-account-modal__field">
              <span className="finance-bank-account-modal__label">Name</span>
              <input
                className="finance-bank-account-modal__input"
                value={name}
                autoFocus
                disabled={pending}
                placeholder="Emergency fund"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {error ? (
              <p className="entity-delete-modal-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="finance-bank-account-modal__actions">
            <span />
            <div className="finance-bank-account-modal__actions-end">
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="entity-delete-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !name.trim()}
                className="finance-bank-account-modal__save"
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function GoalDetailPanel({
  goal,
  pending,
  error,
  transactions,
  transactionsLoading,
  categories,
  accounts,
  accountAvatarSrcById,
  organizations,
  goals,
  recurrings,
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
  onUpdate,
}: {
  goal: FinancialGoal | null;
  pending: boolean;
  error: string | null;
  transactions: FinancialTransaction[];
  transactionsLoading: boolean;
  categories: FinancialCategory[];
  accounts: BankAccount[];
  accountAvatarSrcById: Record<string, string>;
  organizations: FinanceCategoryOrganization[];
  goals: FinancialGoal[];
  recurrings: FinancialRecurring[];
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
  onUpdate: (patch: FinanceGoalUpdateInput) => void | Promise<void>;
}) {
  const [name, setName] = useState(goal?.name ?? "");
  const [goalAmount, setGoalAmount] = useState(
    moneyCentsToInput(goal?.goalAmountCents),
  );
  const [contribution, setContribution] = useState(
    moneyCentsToInput(goal?.contributionCents),
  );
  const [startDate, setStartDate] = useState<string | null>(
    goal?.startDate ?? null,
  );
  const [endDate, setEndDate] = useState<string | null>(goal?.endDate ?? null);
  const [savingMode, setSavingMode] = useState<FinancialGoalSavingMode>(
    normalizeSavingMode(goal?.savingMode),
  );
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const autoPromoteRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useTitleRenameShortcut(
    useCallback(() => {
      focusAndSelectTitleInput(titleInputRef.current);
    }, []),
    { enabled: Boolean(goal) },
  );

  useEffect(() => {
    if (!goal) return;
    setName(goal.name);
    setGoalAmount(moneyCentsToInput(goal.goalAmountCents));
    setContribution(moneyCentsToInput(goal.contributionCents));
    setStartDate(goal.startDate);
    setEndDate(goal.endDate);
    setSavingMode(normalizeSavingMode(goal.savingMode));
    setLocalError(null);
    setIconPickerOpen(false);
    autoPromoteRef.current = false;
  }, [goal]);

  useEffect(() => {
    if (!goal || transactionsLoading || autoPromoteRef.current) return;
    const actualSavedCents = transactions.reduce(
      (sum, tx) => sum + tx.amountCents,
      0,
    );
    const nextListing = nextGoalListingForSavings(
      goal,
      Math.max(0, actualSavedCents),
    );
    if (!nextListing || nextListing === normalizeListing(goal.listing)) return;
    autoPromoteRef.current = true;
    void Promise.resolve(onUpdate({ listing: nextListing })).catch(() => {
      autoPromoteRef.current = false;
    });
  }, [goal, onUpdate, transactions, transactionsLoading]);

  if (!goal) {
    return (
      <aside
        className="finance-categories-view__detail"
        aria-label="Goal details"
      >
        <div className="finance-categories-view__detail-empty">
          <p>Select a goal to edit its details.</p>
        </div>
      </aside>
    );
  }

  const displayError = localError ?? error;
  const accent = goalColor(goal.icon);
  const draftGoalAmountCents =
    parsePositiveMoneyInput(goalAmount) ?? goal.goalAmountCents;
  const draftContributionCents =
    parsePositiveMoneyInput(contribution) ?? goal.contributionCents;
  const chartGoal: FinancialGoal = {
    ...goal,
    goalAmountCents: draftGoalAmountCents,
    contributionCents: draftContributionCents,
    startDate,
    endDate,
    savingMode,
  };
  const actualSavedCents = transactions.reduce(
    (sum, tx) => sum + tx.amountCents,
    0,
  );
  const savedCents = Math.max(
    0,
    transactionsLoading ? resolveGoalSavedCents(goal) : actualSavedCents,
  );
  const leftCents =
    draftGoalAmountCents == null
      ? null
      : Math.max(0, draftGoalAmountCents - savedCents);
  const savingModeOptions: SearchableDropdownOption<FinancialGoalSavingMode>[] =
    SAVING_MODE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }));

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === goal!.name) {
      setName(goal!.name);
      return;
    }
    setLocalError(null);
    try {
      await onUpdate({ name: trimmed });
    } catch (reason) {
      setName(goal!.name);
      setLocalError(
        reason instanceof Error ? reason.message : "Could not rename goal.",
      );
    }
  }

  async function persistPlan(patch: FinanceGoalUpdateInput) {
    setLocalError(null);
    try {
      await onUpdate(patch);
      if (patch.goalAmountCents !== undefined) {
        setGoalAmount(moneyCentsToInput(patch.goalAmountCents));
      }
      if (patch.contributionCents !== undefined) {
        setContribution(moneyCentsToInput(patch.contributionCents));
      }
      if (patch.startDate !== undefined) setStartDate(patch.startDate);
      if (patch.endDate !== undefined) setEndDate(patch.endDate);
      if (patch.savingMode !== undefined) {
        setSavingMode(normalizeSavingMode(patch.savingMode));
      }
    } catch (reason) {
      setGoalAmount(moneyCentsToInput(goal!.goalAmountCents));
      setContribution(moneyCentsToInput(goal!.contributionCents));
      setStartDate(goal!.startDate);
      setEndDate(goal!.endDate);
      setSavingMode(normalizeSavingMode(goal!.savingMode));
      setLocalError(
        reason instanceof Error ? reason.message : "Could not update goal plan.",
      );
      throw reason;
    }
  }

  function resolvedGoalAmountCents(): number | null {
    return parsePositiveMoneyInput(goalAmount) ?? goal!.goalAmountCents;
  }

  function resolvedContributionCents(): number | null {
    return parsePositiveMoneyInput(contribution) ?? goal!.contributionCents;
  }

  /** End date edited last → recompute contribution from goal ÷ periods. */
  function syncContributionFromEnd(
    nextEnd: string | null,
    nextStart: string | null = startDate,
    nextMode: FinancialGoalSavingMode = savingMode,
    nextGoalAmount: number | null = resolvedGoalAmountCents(),
  ): number | null {
    if (!nextEnd) return null;
    return deriveContributionCents({
      goalAmountCents: nextGoalAmount,
      startDate: nextStart,
      endDate: nextEnd,
      savingMode: nextMode,
    });
  }

  /** Contribution edited last → recompute end from goal ÷ contribution. */
  function syncEndFromContribution(
    nextContribution: number | null,
    nextStart: string | null = startDate,
    nextMode: FinancialGoalSavingMode = savingMode,
    nextGoalAmount: number | null = resolvedGoalAmountCents(),
  ): string | null {
    if (nextContribution == null) return null;
    return deriveEndDate({
      goalAmountCents: nextGoalAmount,
      contributionCents: nextContribution,
      startDate: nextStart,
      savingMode: nextMode,
    });
  }

  async function commitGoalAmount() {
    const next = parsePositiveMoneyInput(goalAmount);
    const current =
      goal!.goalAmountCents == null || goal!.goalAmountCents <= 0
        ? null
        : goal!.goalAmountCents;
    if (next === current) {
      setGoalAmount(moneyCentsToInput(current));
      return;
    }

    const patch: FinanceGoalUpdateInput = { goalAmountCents: next };
    if (next != null && endDate) {
      const nextContribution = syncContributionFromEnd(
        endDate,
        startDate,
        savingMode,
        next,
      );
      if (nextContribution != null) {
        patch.contributionCents = nextContribution;
        setContribution(moneyCentsToInput(nextContribution));
      }
    } else if (next != null) {
      const nextEnd = syncEndFromContribution(
        resolvedContributionCents(),
        startDate,
        savingMode,
        next,
      );
      if (nextEnd) {
        patch.endDate = nextEnd;
        setEndDate(nextEnd);
      }
    }

    setGoalAmount(moneyCentsToInput(next));
    try {
      await persistPlan(patch);
    } catch {
      /* persistPlan already restored local drafts */
    }
  }

  async function commitContribution() {
    const next = parsePositiveMoneyInput(contribution);
    const current =
      goal!.contributionCents == null || goal!.contributionCents <= 0
        ? null
        : goal!.contributionCents;
    if (next === current) {
      // Still refresh end if contribution unchanged but end is out of sync.
      const syncedEnd = syncEndFromContribution(next);
      if (syncedEnd && syncedEnd !== endDate) {
        setEndDate(syncedEnd);
        try {
          await persistPlan({ endDate: syncedEnd });
        } catch {
          /* restored */
        }
      } else {
        setContribution(moneyCentsToInput(current));
      }
      return;
    }

    const patch: FinanceGoalUpdateInput = { contributionCents: next };
    const nextEnd = syncEndFromContribution(next);
    if (nextEnd) {
      patch.endDate = nextEnd;
      setEndDate(nextEnd);
    }
    setContribution(moneyCentsToInput(next));
    try {
      await persistPlan(patch);
    } catch {
      /* restored */
    }
  }

  async function commitStartDate(next: string | null) {
    const previous = startDate;
    setStartDate(next);
    const patch: FinanceGoalUpdateInput = { startDate: next };
    if (next && endDate) {
      const nextContribution = syncContributionFromEnd(
        endDate,
        next,
        savingMode,
      );
      if (nextContribution != null) {
        patch.contributionCents = nextContribution;
        setContribution(moneyCentsToInput(nextContribution));
      }
    } else if (next) {
      const nextEnd = syncEndFromContribution(
        resolvedContributionCents(),
        next,
        savingMode,
      );
      if (nextEnd) {
        patch.endDate = nextEnd;
        setEndDate(nextEnd);
      }
    }
    try {
      await persistPlan(patch);
    } catch {
      setStartDate(previous);
    }
  }

  async function commitEndDate(next: string | null) {
    const previous = endDate;
    const previousContribution = contribution;
    setEndDate(next);
    const patch: FinanceGoalUpdateInput = { endDate: next };
    const nextContribution = syncContributionFromEnd(next);
    if (nextContribution != null) {
      patch.contributionCents = nextContribution;
      setContribution(moneyCentsToInput(nextContribution));
    }
    try {
      await persistPlan(patch);
    } catch {
      setEndDate(previous);
      setContribution(previousContribution);
    }
  }

  async function commitSavingMode(next: FinancialGoalSavingMode) {
    if (next === savingMode) return;
    const previous = savingMode;
    const previousContribution = contribution;
    const previousEnd = endDate;
    setSavingMode(next);
    const patch: FinanceGoalUpdateInput = { savingMode: next };
    if (endDate) {
      const nextContribution = syncContributionFromEnd(
        endDate,
        startDate,
        next,
      );
      if (nextContribution != null) {
        patch.contributionCents = nextContribution;
        setContribution(moneyCentsToInput(nextContribution));
      }
    } else {
      const nextEnd = syncEndFromContribution(
        resolvedContributionCents(),
        startDate,
        next,
      );
      if (nextEnd) {
        patch.endDate = nextEnd;
        setEndDate(nextEnd);
      }
    }
    try {
      await persistPlan(patch);
    } catch {
      setSavingMode(previous);
      setContribution(previousContribution);
      setEndDate(previousEnd);
    }
  }

  function onGoalAmountDraftChange(raw: string) {
    const formatted = formatMoneyInput(raw);
    setGoalAmount(formatted);
    const cents = parsePositiveMoneyInput(formatted);
    if (cents == null) return;
    if (endDate) {
      const nextContribution = syncContributionFromEnd(
        endDate,
        startDate,
        savingMode,
        cents,
      );
      if (nextContribution != null) {
        setContribution(moneyCentsToInput(nextContribution));
      }
    } else {
      const nextEnd = syncEndFromContribution(
        resolvedContributionCents(),
        startDate,
        savingMode,
        cents,
      );
      if (nextEnd) setEndDate(nextEnd);
    }
  }

  return (
    <aside
      className="finance-categories-view__detail finance-goals-view__detail"
      aria-label="Goal details"
    >
      <div className="finance-categories-view__detail-hero">
        <div className="finance-categories-view__detail-hero-main">
          <button
            type="button"
            className="finance-categories-view__detail-marks"
            aria-label={`Change icon for ${goal.name}`}
            disabled={pending}
            onClick={() => setIconPickerOpen(true)}
          >
            <span
              className="finance-categories-view__detail-color-dot"
              style={{ background: accent }}
              aria-hidden="true"
            />
            <span
              className="finance-categories-view__detail-mark-icon"
              aria-hidden="true"
            >
              <GoalIcon icon={goal.icon} size={16} />
            </span>
          </button>
          <div className="finance-categories-view__detail-heading">
            <input
              ref={titleInputRef}
              className="finance-categories-view__detail-title-input"
              value={name}
              disabled={pending}
              aria-label="Goal name"
              {...{ [ENTITY_TITLE_INPUT_ATTRIBUTE]: "" }}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                void commitName();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  event.nativeEvent.stopImmediatePropagation();
                  setName(goal.name);
                  event.currentTarget.blur();
                  return;
                }
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
            <label className="finance-categories-view__detail-budget-wrap">
              <span className="finance-goals-view__detail-budget-label">
                Budget
              </span>
              <span
                className="finance-categories-view__detail-budget-prefix"
                aria-hidden="true"
              >
                €
              </span>
              <input
                className="finance-categories-view__detail-budget-input"
                inputMode="decimal"
                aria-label="Budget"
                placeholder="0"
                value={goalAmount}
                disabled={pending}
                {...moneyInputContentWidth(goalAmount)}
                onChange={(event) => onGoalAmountDraftChange(event.target.value)}
                onBlur={() => {
                  void commitGoalAmount();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
          </div>
        </div>

        <div className="finance-categories-view__detail-hero-spend">
          <span className="finance-categories-view__detail-spend-label">
            Saved so far
          </span>
          <span className="finance-categories-view__detail-spend-amount">
            {formatMoney(savedCents)}
          </span>
          <span className="finance-categories-view__detail-spend-left">
            {leftCents != null
              ? `${formatMoney(leftCents)} left`
              : "No goal amount set"}
          </span>
        </div>
      </div>

      <EntityIconPicker
        open={iconPickerOpen}
        value={goal.icon}
        dialogTitle="Choose goal icon"
        onClose={() => setIconPickerOpen(false)}
        onSelect={(icon) => {
          setIconPickerOpen(false);
          setLocalError(null);
          void Promise.resolve(onUpdate({ icon })).catch((reason) => {
            setLocalError(
              reason instanceof Error
                ? reason.message
                : "Could not update icon.",
            );
          });
        }}
        defaultOption={{
          label: "Default goal icon",
          preview: <DefaultProjectIcon size={16} />,
        }}
      />

      <GoalProgressChart
        goal={chartGoal}
        transactions={transactions}
        loading={transactionsLoading}
        accent={accent}
      />

      <GoalKeyMetrics
        transactions={transactions}
        contributionCents={draftContributionCents}
        savingMode={savingMode}
        startDate={startDate}
        endDate={endDate}
        loading={transactionsLoading}
        savedCents={savedCents}
        goalAmountCents={draftGoalAmountCents}
      />

      <section className="finance-goals-view__summary" aria-label="Goal plan">
        <FinanceDetailSectionTitle>Summary</FinanceDetailSectionTitle>

        <div className="finance-goals-view__summary-row">
          <span className="finance-goals-view__summary-label">Goal amount</span>
          <label className="finance-goals-view__money-field">
            <span className="finance-goals-view__money-prefix" aria-hidden="true">
              €
            </span>
            <input
              className="finance-goals-view__money-input"
              inputMode="decimal"
              aria-label="Goal amount"
              placeholder="0"
              value={goalAmount}
              disabled={pending}
              {...moneyInputContentWidth(goalAmount)}
              onChange={(event) => onGoalAmountDraftChange(event.target.value)}
              onBlur={() => {
                void commitGoalAmount();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
        </div>

        <div className="finance-goals-view__summary-row">
          <span className="finance-goals-view__summary-label">Period</span>
          <span className="finance-goals-view__period">
            <TaskDueDateDropdown
              dueDate={parseCalendarDate(startDate)}
              variant="property"
              triggerVariant="inlineChip"
              noDueDateLabel="No start date"
              searchPlaceholder="today, next monday…"
              taskPropertyDropdownId="startDate"
              showIcon={false}
              disabled={pending}
              onDueDateChange={(date) => {
                void commitStartDate(date ? formatCalendarDate(date) : null);
              }}
            />
            <span className="finance-goals-view__period-sep" aria-hidden="true">
              ›
            </span>
            <TaskDueDateDropdown
              dueDate={parseCalendarDate(endDate)}
              variant="property"
              triggerVariant="inlineChip"
              noDueDateLabel="No end date"
              searchPlaceholder="today, next monday…"
              taskPropertyDropdownId="dueDate"
              showIcon={false}
              disabled={pending}
              onDueDateChange={(date) => {
                void commitEndDate(date ? formatCalendarDate(date) : null);
              }}
            />
          </span>
        </div>

        <div className="finance-goals-view__summary-row">
          <span className="finance-goals-view__summary-label">
            {contributionLabelForMode(savingMode)}
          </span>
          <label className="finance-goals-view__money-field">
            <span className="finance-goals-view__money-prefix" aria-hidden="true">
              €
            </span>
            <input
              className="finance-goals-view__money-input"
              inputMode="decimal"
              aria-label={contributionLabelForMode(savingMode)}
              placeholder="0"
              value={contribution}
              disabled={pending}
              {...moneyInputContentWidth(contribution)}
              onChange={(event) => {
                const formatted = formatMoneyInput(event.target.value);
                setContribution(formatted);
                const cents = parsePositiveMoneyInput(formatted);
                const nextEnd = syncEndFromContribution(cents);
                if (nextEnd) setEndDate(nextEnd);
              }}
              onBlur={() => {
                void commitContribution();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
        </div>

        <div className="finance-goals-view__summary-row">
          <span className="finance-goals-view__summary-label">Saving mode</span>
          <SearchableDropdown
            ariaLabel="Saving mode"
            className="property-dropdown"
            triggerClassName="property-dropdown-trigger--inline-chip"
            value={savingMode}
            options={savingModeOptions}
            searchPlaceholder="Saving mode"
            panelWidth={220}
            onChange={(value) => {
              void commitSavingMode(normalizeSavingMode(value));
            }}
          />
        </div>
      </section>

      <section
        className="finance-goals-view__transactions"
        aria-label="Transactions"
      >
        <FinanceTransactionsPanelList
          transactions={transactions}
          loading={transactionsLoading}
          categories={categories}
          accounts={accounts}
          accountAvatarSrcById={accountAvatarSrcById}
          organizations={organizations}
          goals={goals}
          recurrings={recurrings}
          emptyLabel="No transactions linked to this goal."
          listKeyboardNavZone={LIST_KEYBOARD_NAV_ZONE_CONTENT}
          onPatchTransaction={onPatchTransaction}
          onBulkPatchTransactions={onBulkPatchTransactions}
          onBulkDeleteTransactions={onBulkDeleteTransactions}
          onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
        />
      </section>

      {displayError ? (
        <p className="entity-delete-modal-error" role="alert">
          {displayError}
        </p>
      ) : null}
    </aside>
  );
}

function GoalRow({
  goal,
  selected,
  highlighted = false,
  onSelect,
  pointerReorderBind = null,
  dragging = false,
  showDragInsertBefore = false,
}: {
  goal: FinancialGoal;
  selected: boolean;
  highlighted?: boolean;
  onSelect: () => void;
  pointerReorderBind?: GroupedListPointerItemBind | null;
  dragging?: boolean;
  showDragInsertBefore?: boolean;
}) {
  const savedCents = resolveGoalSavedCents(goal);
  const canPointerReorder = Boolean(pointerReorderBind);
  return (
    <li
      className={[
        "finance-categories-view__row",
        selected ? "is-selected" : null,
        showDragInsertBefore
          ? "finance-categories-view__row--insert-before"
          : null,
        dragging ? "finance-categories-view__row--dragging" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      {...keyboardNavItemProps(goal.id)}
    >
      <div
        className={[
          "finance-categories-view__row-main",
          canPointerReorder
            ? "finance-categories-view__row-main--draggable"
            : null,
          keyboardNavListItemClass(highlighted),
        ]
          .filter(Boolean)
          .join(" ")}
        role="button"
        tabIndex={0}
        data-tauri-drag-region="false"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect();
        }}
        {...(pointerReorderBind ?? {})}
      >
        <span className="finance-categories-view__row-leading">
          <span className="finance-categories-view__row-icon" aria-hidden="true">
            <GoalIcon icon={goal.icon} size={16} />
          </span>
          <span className="finance-categories-view__row-meta">
            <span className="finance-categories-view__row-name">{goal.name}</span>
          </span>
        </span>
        <GoalAmountColumns
          savedCents={savedCents}
          goalAmountCents={goal.goalAmountCents}
        />
        <span className="finance-categories-view__row-action-spacer" />
      </div>
    </li>
  );
}

export function FinanceGoalsView({
  goals,
  pending = false,
  error = null,
  selectedGoalTransactions = [],
  selectedGoalTransactionsLoading = false,
  monthIncomeCents = 0,
  categories = [],
  accounts = [],
  accountAvatarSrcById = {},
  organizations = [],
  recurrings = [],
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
  onChromeStateChange,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  onSelectedGoalChange,
}: FinanceGoalsViewProps) {
  const [localGoals, setLocalGoals] = useState(goals);
  useEffect(() => {
    setLocalGoals(goals);
  }, [goals]);

  const promotingIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const adjustments = goals.flatMap((goal) => {
      const nextListing = nextGoalListingForSavings(
        goal,
        resolveGoalSavedCents(goal),
      );
      if (!nextListing || nextListing === normalizeListing(goal.listing)) {
        return [];
      }
      return [{ goal, nextListing }];
    });
    const pendingAdjust = adjustments.filter(
      ({ goal }) => !promotingIdsRef.current.has(goal.id),
    );
    if (pendingAdjust.length === 0) return;

    for (const { goal } of pendingAdjust) {
      promotingIdsRef.current.add(goal.id);
    }

    setLocalGoals((rows) =>
      rows.map((row) => {
        const match = pendingAdjust.find(({ goal }) => goal.id === row.id);
        return match ? { ...row, listing: match.nextListing } : row;
      }),
    );

    for (const { goal, nextListing } of pendingAdjust) {
      void Promise.resolve(onUpdate(goal.id, { listing: nextListing }))
        .catch(() => {
          setLocalGoals((rows) =>
            rows.map((row) =>
              row.id === goal.id ? { ...row, listing: goal.listing } : row,
            ),
          );
        })
        .finally(() => {
          promotingIdsRef.current.delete(goal.id);
        });
    }
  }, [goals, onUpdate]);

  const groups = useMemo(() => buildListingGroups(localGoals), [localGoals]);
  const savedColumnLabels = useMemo(
    () =>
      localGoals.map((goal) => formatMoney(resolveGoalSavedCents(goal))),
    [localGoals],
  );
  const goalColumnLabels = useMemo(
    () => localGoals.map((goal) => formatGoalCell(goal.goalAmountCents)),
    [localGoals],
  );
  const savedColumnWidthPx = useFinanceMoneyColumnWidthFromValues(
    savedColumnLabels,
    ["Saved"],
  );
  const goalColumnWidthPx = useFinanceMoneyColumnWidthFromValues(
    goalColumnLabels,
    ["Goal"],
  );
  const overview = useMemo(() => {
    const active = groups.find((group) => group.id === "active")?.goals ?? [];
    const income = Math.max(0, monthIncomeCents);
    const hasContribution = active.some(
      (goal) =>
        goal.contributionCents != null && goal.contributionCents > 0,
    );
    const equalShare =
      !hasContribution && active.length > 0
        ? Math.max(income, 1) / active.length
        : 0;

    const slices: FinanceOverviewPieSlice[] = active.map((goal, index) => {
      const color =
        getEntityIconColor(goal.icon) ??
        ENTITY_ICON_COLOR_PRESETS[index % ENTITY_ICON_COLOR_PRESETS.length]!;
      const savedCents = resolveGoalSavedCents(goal);
      const goalAmount =
        goal.goalAmountCents != null && goal.goalAmountCents > 0
          ? goal.goalAmountCents
          : 0;
      const contribution =
        goal.contributionCents != null && goal.contributionCents > 0
          ? goal.contributionCents
          : 0;
      const value = hasContribution
        ? contribution
        : equalShare;
      const progress =
        goalAmount > 0
          ? Math.min(1, Math.max(0, savedCents / goalAmount))
          : savedCents > 0
            ? 1
            : 0;
      return {
        id: goal.id,
        label: goal.name,
        value,
        color,
        progress,
      };
    });

    const allocated = slices.reduce((sum, slice) => sum + slice.value, 0);
    if (income > allocated) {
      slices.push({
        id: "__unallocated",
        label: "Unallocated",
        value: income - allocated,
        color: GOALS_PIE_REMAINDER_COLOR,
        progress: 1,
      });
    }

    const savedCents = active.reduce(
      (sum, goal) => sum + resolveGoalSavedCents(goal),
      0,
    );
    const goalAmountCents = active.reduce((sum, goal) => {
      const amount =
        goal.goalAmountCents != null && goal.goalAmountCents > 0
          ? goal.goalAmountCents
          : 0;
      return sum + amount;
    }, 0);
    return { slices, savedCents, goalAmountCents };
  }, [groups, monthIncomeCents]);

  const [collapsed, setCollapsed] = useState<
    Partial<Record<FinancialGoalListing, boolean>>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [createState, setCreateState] = useState<CreateModalState>(null);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const canReorder = Boolean(onReorder);

  const handleGoalReorder = useCallback(
    (request: FinanceListReorderRequest) => {
      setLocalGoals((current) => applyOptimisticGoalReorder(current, request));
      if (request.fromGroupKey !== request.toGroupKey) {
        setCollapsed((current) => ({
          ...current,
          [request.toGroupKey as FinancialGoalListing]: false,
        }));
      }
      onReorder?.(request);
    },
    [onReorder],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => {
      const goal = localGoals.find((entry) => entry.id === itemId);
      return goal ? financeGoalGroupKey(goal) : undefined;
    },
    [localGoals],
  );

  const {
    draggingItemId,
    insertBeforeKey,
    bindItem,
    bindAppendZone,
    consumeClickSuppression,
  } = useGroupedListPointerReorder({
    enabled: canReorder,
    getItemGroupKey,
    itemOrderKey: financeGoalOrderKey,
    groupAppendOrderKey: financeGoalGroupAppendOrderKey,
    onReorder: handleGoalReorder,
  });

  const selectGoal = useCallback(
    (goalId: string) => {
      if (consumeClickSuppression()) return;
      setSelectedId(goalId);
      setDetailCollapsed(false);
    },
    [consumeClickSuppression],
  );

  const closeGoalDetail = useCallback(() => {
    setSelectedId(null);
  }, []);

  useListDismissDetailShortcut({
    enabled: selectedId != null,
    onDismiss: closeGoalDetail,
  });

  const keyboardItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      if (collapsed[group.id]) continue;
      for (const goal of group.goals) {
        ids.push(goal.id);
      }
    }
    return ids;
  }, [collapsed, groups]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: keyboardItemIds,
    selectedId,
    onNavigate: selectGoal,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: keyboardItemIds.length > 0,
  });

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailResized,
    beginResize: beginDetailResize,
    resetWidth: resetDetailWidth,
  } = useFinancePanelResize(FINANCE_GOAL_DETAIL_WIDTH_KEY);

  const selected = localGoals.find((entry) => entry.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !localGoals.some((entry) => entry.id === selectedId)) {
      setSelectedId(null);
    }
  }, [localGoals, selectedId]);

  useEffect(() => {
    onSelectedGoalChange?.(selectedId);
  }, [onSelectedGoalChange, selectedId]);

  useEffect(() => {
    if (!selectedId) setDetailCollapsed(false);
  }, [selectedId]);

  useEffect(() => {
    if (!onChromeStateChange) return;
    if (!selected) {
      onChromeStateChange(null);
      return;
    }
    const target = selected;
    onChromeStateChange({
      hasSelection: true,
      detailCollapsed,
      detailResized,
      onToggleDetail: () => setDetailCollapsed((current) => !current),
      goal: target,
      currentListing: normalizeListing(target.listing),
      onSetListing: (listing) => {
        void onUpdate(target.id, { listing });
      },
      onDelete: async () => {
        await Promise.resolve(onDelete(target.id));
        setSelectedId(null);
      },
    });
  }, [
    detailResized,
    detailCollapsed,
    onChromeStateChange,
    onDelete,
    onUpdate,
    selected,
  ]);

  useEffect(() => {
    return () => onChromeStateChange?.(null);
  }, [onChromeStateChange]);

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Goals">
      <div
        ref={containerRef}
        className={[
          "finance-categories-view",
          "finance-goals-view",
          selected ? "has-selection" : null,
          selected && detailCollapsed ? "is-detail-collapsed" : null,
          detailWidth != null ? "is-detail-resized" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--finance-cat-spent-w": `${savedColumnWidthPx}px`,
            "--finance-cat-budget-w": `${goalColumnWidthPx}px`,
            ...(detailWidth != null
              ? { "--finance-cat-detail-w": `${detailWidth}px` }
              : {}),
          } as CSSProperties
        }
      >
        <div className="finance-categories-view__list-pane">
          <GoalsOverviewCard
            savedCents={overview.savedCents}
            goalAmountCents={overview.goalAmountCents}
            slices={overview.slices}
          />

          <ul
            className="overview-grouped-list"
            role="list"
            ref={listRef}
            {...listContainerProps}
          >
            {groups.map((group) => {
              const isCollapsed = Boolean(collapsed[group.id]);
              const showColumnHeaders = group.id === "active";
              const appendKey = financeGoalGroupAppendOrderKey(group.id);
              return (
                <ProjectTypeGroupSection
                  key={group.id}
                  title={`${group.label} (${group.count})`}
                  collapsed={isCollapsed}
                  onToggle={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [group.id]: !current[group.id],
                    }))
                  }
                  onAdd={() => {
                    setCollapsed((current) => ({
                      ...current,
                      [group.id]: false,
                    }));
                    setCreateError(null);
                    setCreateState({ listing: group.id });
                  }}
                  addActionLabel="goal"
                  pointerReorderAppend={
                    canReorder ? bindAppendZone(group.id) : null
                  }
                  showPointerAppendIndicator={insertBeforeKey === appendKey}
                  trailing={
                    showColumnHeaders ? (
                      <span className="finance-categories-view__column-headers">
                        <span>Saved</span>
                        <span
                          className="finance-categories-view__column-headers-gap"
                          aria-hidden="true"
                        />
                        <span>Goal</span>
                      </span>
                    ) : null
                  }
                >
                  {group.goals.length === 0 ? (
                    <li className="finance-categories-view__group-empty">
                      Nothing here yet
                    </li>
                  ) : (
                    group.goals.map((goal) => (
                      <GoalRow
                        key={goal.id}
                        goal={goal}
                        selected={selectedId === goal.id}
                        highlighted={highlightedId === goal.id}
                        onSelect={() => selectGoal(goal.id)}
                        pointerReorderBind={
                          canReorder
                            ? bindItem(goal.id, financeGoalGroupKey(goal))
                            : null
                        }
                        dragging={draggingItemId === goal.id}
                        showDragInsertBefore={
                          insertBeforeKey === financeGoalOrderKey(goal.id)
                        }
                      />
                    ))
                  )}
                </ProjectTypeGroupSection>
              );
            })}
          </ul>

          {error && !selected ? (
            <p className="entity-delete-modal-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {selected && !detailCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize goal panel"
            title="Drag to resize"
            className="finance-categories-view__resize-handle"
            onPointerDown={(event) => {
              event.preventDefault();
              beginDetailResize(event.clientX);
            }}
            onDoubleClick={resetDetailWidth}
          />
        ) : null}

        <div
          ref={detailPaneRef}
          className="finance-categories-view__detail-pane"
        >
          <GoalDetailPanel
            goal={selected}
            pending={pending}
            error={error}
            transactions={selectedGoalTransactions}
            transactionsLoading={selectedGoalTransactionsLoading}
            categories={categories}
            accounts={accounts}
            accountAvatarSrcById={accountAvatarSrcById}
            organizations={organizations}
            goals={localGoals}
            recurrings={recurrings}
            onPatchTransaction={onPatchTransaction}
            onBulkPatchTransactions={onBulkPatchTransactions}
            onBulkDeleteTransactions={onBulkDeleteTransactions}
            onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
            onUpdate={(patch) => {
              if (!selected) return;
              return onUpdate(selected.id, patch);
            }}
          />
        </div>
      </div>

      <CreateGoalModal
        state={createState}
        pending={createPending}
        error={createError}
        onClose={() => {
          if (createPending) return;
          setCreateState(null);
          setCreateError(null);
        }}
        onSubmit={async (name) => {
          if (!createState) return;
          setCreatePending(true);
          setCreateError(null);
          try {
            await onCreate({
              name,
              listing: createState.listing,
            });
            setCreateState(null);
          } catch (reason) {
            setCreateError(
              reason instanceof Error
                ? reason.message
                : "Could not create goal.",
            );
          } finally {
            setCreatePending(false);
          }
        }}
      />
    </EntityDetailLayout>
  );
}
