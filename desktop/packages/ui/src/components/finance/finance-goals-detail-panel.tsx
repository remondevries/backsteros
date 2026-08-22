"use client";

import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialGoalSavingMode,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_ENTITY_ICON_COLOR } from "../../entity/entity-icon.js";
import {
  formatMoneyInput,
  moneyCentsToInput,
  moneyInputContentWidth,
  parseMoneyInput,
} from "../../finance/money-input.js";
import { LIST_KEYBOARD_NAV_ZONE_CONTENT } from "../../list-nav/list-keyboard-nav-zone.js";
import { ENTITY_TITLE_INPUT_ATTRIBUTE } from "../../list-nav/use-list-clear-selection-shortcut.js";
import {
  focusAndSelectTitleInput,
  useTitleRenameShortcut,
} from "../../shortcuts/title-rename-shortcut.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { EntityIconPicker } from "../entity/entity-icon-picker.js";
import {
  FinanceTransactionsPanelList,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
} from "./finance-categories-view.js";
import { FinanceDetailSectionTitle } from "./finance-detail-section-title.js";
import { GoalProgressChart } from "./goal-progress-chart.js";
import { getEntityIconColor } from "../projects/project-octicon.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import {
  deriveContributionCents,
  deriveEndDate,
} from "../../finance/goal-plan.js";
import {
  formatMoney,
  GoalIcon,
  nextGoalListingForSavings,
  normalizeListing,
  normalizeSavingMode,
  parseCalendarDate,
  resolveGoalSavedCents,
  type FinanceGoalUpdateInput,
} from "./finance-goals-shared.js";
import { GoalKeyMetrics } from "./finance-goals-key-metrics.js";

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

function contributionLabelForMode(mode: FinancialGoalSavingMode): string {
  return (
    SAVING_MODE_OPTIONS.find((option) => option.value === mode)
      ?.contributionLabel ?? "Monthly contribution"
  );
}

function parsePositiveMoneyInput(raw: string): number | null {
  return parseMoneyInput(raw, { positive: true });
}

function formatCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function goalColor(icon: string | null | undefined): string {
  return getEntityIconColor(icon) ?? DEFAULT_ENTITY_ICON_COLOR;
}

export function GoalDetailPanel({
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
