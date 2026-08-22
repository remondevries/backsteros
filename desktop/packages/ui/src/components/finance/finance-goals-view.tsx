"use client";

import type {
  FinancialGoal,
  FinancialGoalListing,
} from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { ENTITY_ICON_COLOR_PRESETS } from "../../entity/entity-icon.js";
import {
  applyOptimisticGoalReorder,
  financeGoalGroupAppendOrderKey,
  financeGoalGroupKey,
  financeGoalOrderKey,
  type FinanceListReorderRequest,
} from "../../finance/finance-list-reorder.js";
import { useFinanceMoneyColumnWidthFromValues } from "../../finance/finance-money-column-width.js";
import { useFinancePanelResize } from "../../finance/use-finance-panel-resize.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerItemBind,
} from "../../list-nav/use-grouped-list-pointer-reorder.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import { useListDismissDetailShortcut } from "../../list-nav/use-list-clear-selection-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { EntityDetailLayout } from "../entity/entity-detail-layout.js";
import {
  FinanceOverviewPie,
  type FinanceOverviewPieSlice,
} from "./finance-overview-pie.js";
import { getEntityIconColor } from "../projects/project-octicon.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import {
  CreateGoalModal,
  type CreateModalState,
} from "./finance-goals-actions-menu.js";
import { GoalDetailPanel } from "./finance-goals-detail-panel.js";
import {
  formatGoalCell,
  formatMoney,
  GoalIcon,
  nextGoalListingForSavings,
  normalizeListing,
  resolveGoalSavedCents,
  type FinanceGoalsViewProps,
} from "./finance-goals-shared.js";

export {
  computeGoalSavedCents,
  nextGoalListingForSavings,
  resolveGoalSavedCents,
  shouldPromoteGoalToReadyToSpend,
  type FinanceGoalsChromeState,
  type FinanceGoalCreateInput,
  type FinanceGoalUpdateInput,
  type FinanceGoalsViewProps,
} from "./finance-goals-shared.js";
export { GoalActionsMenu } from "./finance-goals-actions-menu.js";

const GOALS_PIE_REMAINDER_COLOR =
  "color-mix(in srgb, var(--foreground) 14%, transparent)";

const FINANCE_GOAL_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-goals-detail-width";

type ListingGroup = {
  id: FinancialGoalListing;
  label: string;
  goals: FinancialGoal[];
  count: number;
};

function goalProgressTone(savedCents: number, goalAmountCents: number) {
  const ratio = savedCents / goalAmountCents;
  if (ratio >= 1) return "ok";
  if (ratio >= 0.75) return "warn";
  return "low";
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
