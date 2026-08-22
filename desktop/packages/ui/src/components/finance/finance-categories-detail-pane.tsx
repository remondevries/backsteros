"use client";

import type {
  BankAccount,
  FinancialCategory,
  FinancialCategoryListing,
  FinancialGoal,
  FinancialRecurring,
} from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { parseEntityIcon } from "../../entity/entity-icon.js";
import { LIST_KEYBOARD_NAV_ZONE_CONTENT } from "../../list-nav/list-keyboard-nav-zone.js";
import { ENTITY_TITLE_INPUT_ATTRIBUTE } from "../../list-nav/use-list-clear-selection-shortcut.js";
import {
  focusAndSelectTitleInput,
  useTitleRenameShortcut,
} from "../../shortcuts/title-rename-shortcut.js";
import {
  formatMoneyInput,
  moneyCentsToInput,
  moneyInputContentWidth,
} from "../../finance/money-input.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { EntityIconPicker } from "../entity/entity-icon-picker.js";
import { FinanceDetailSectionTitle } from "./finance-detail-section-title.js";
import { CategorySpendChart } from "./category-spend-chart.js";
import {
  FinanceOverviewPie,
  type FinanceOverviewPieSlice,
} from "./finance-overview-pie.js";
import {
  CategoryIcon,
  categoryColor,
  formatMoney,
  formatSpentInMonthHeading,
  formatSpentInMonthLabel,
  parseBudgetInput,
  type FinanceCategoryMetrics,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
  type FinanceCategoryUpdateInput,
  type FinanceCategoryYearMetric,
} from "./finance-categories-shared.js";
import { FinanceTransactionsPanelList } from "./finance-categories-tx-panel-list.js";

export type OverviewSlice = {
  id: string;
  name: string;
  color: string;
  spentCents: number;
};

export function BudgetOverviewCard({
  spentCents,
  budgetCents,
  spentMonth,
  slices,
}: {
  spentCents: number;
  budgetCents: number;
  spentMonth: string | null;
  slices: OverviewSlice[];
}) {
  const pieSlices: FinanceOverviewPieSlice[] = slices
    .filter((slice) => slice.spentCents > 0)
    .map((slice) => ({
      id: slice.id,
      label: slice.name,
      value: slice.spentCents,
      color: slice.color,
    }));

  return (
    <div
      className="finance-categories-view__overview"
      aria-label="Budget overview"
    >
      <div className="finance-categories-view__overview-stat finance-categories-view__overview-stat--spent">
        <span
          className={[
            "finance-categories-view__overview-value",
            spentCents > 0
              ? "is-debit"
              : spentCents < 0
                ? "is-credit"
                : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {formatMoney(spentCents === 0 ? 0 : -spentCents)}
        </span>
        <span className="finance-categories-view__overview-label">
          {formatSpentInMonthLabel(spentMonth)}
        </span>
      </div>
      <FinanceOverviewPie slices={pieSlices} />
      <div className="finance-categories-view__overview-stat finance-categories-view__overview-stat--budget">
        <span className="finance-categories-view__overview-value">
          {formatMoney(budgetCents)}
        </span>
        <span className="finance-categories-view__overview-label">
          total budget
        </span>
      </div>
    </div>
  );
}

export type CreateModalState =
  | {
      listing: FinancialCategoryListing;
      parentId: string | null;
      parentName?: string;
    }
  | null;

export function CreateCategoryModal({
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

  const isSub = Boolean(state.parentId);
  const title = isSub
    ? `Add subcategory${state.parentName ? ` under ${state.parentName}` : ""}`
    : `Add ${state.listing === "excluded" ? "excluded" : "regular"} category`;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-finance-category-create-modal=""
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
                placeholder={isSub ? "Coffee" : "Groceries"}
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

export function CategoryDetailPanel({
  category,
  hasChildren,
  spentCents,
  spentMonth,
  metrics,
  metricsLoading,
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
  pending,
  error,
  onUpdate,
  onDelete,
}: {
  category: FinancialCategory | null;
  hasChildren: boolean;
  spentCents: number;
  spentMonth: string | null;
  metrics: FinanceCategoryMetrics | null;
  metricsLoading: boolean;
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
  pending: boolean;
  error: string | null;
  onUpdate: (patch: FinanceCategoryUpdateInput) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [budget, setBudget] = useState(moneyCentsToInput(category?.budgetCents));
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useTitleRenameShortcut(
    useCallback(() => {
      focusAndSelectTitleInput(titleInputRef.current);
    }, []),
    { enabled: Boolean(category) },
  );

  useEffect(() => {
    if (!category) return;
    setName(category.name);
    setBudget(moneyCentsToInput(category.budgetCents));
    setLocalError(null);
    setIconPickerOpen(false);
  }, [category]);

  const childCategories = useMemo(
    () =>
      category
        ? categories.filter((row) => row.parentId === category.id)
        : [],
    [categories, category],
  );

  const chartBudgetCents = useMemo(() => {
    if (!category) return null;
    const own =
      category.budgetCents != null && category.budgetCents > 0
        ? category.budgetCents
        : 0;
    if (own > 0) return own;
    // Parent with no budget: use the sum of subcategory budgets as the
    // reference line so the chart still has a gray budget marker.
    if (childCategories.length === 0) return null;
    const childSum = childCategories.reduce((sum, child) => {
      const childBudget =
        child.budgetCents != null && child.budgetCents > 0
          ? child.budgetCents
          : 0;
      return sum + childBudget;
    }, 0);
    return childSum > 0 ? childSum : null;
  }, [category, childCategories]);

  const draftBudgetCents = parseBudgetInput(budget);
  const leftCents =
    draftBudgetCents == null
      ? null
      : Math.max(0, draftBudgetCents - Math.max(0, spentCents));

  if (!category) {
    return (
      <aside className="finance-categories-view__detail" aria-label="Category details">
        <div className="finance-categories-view__detail-empty">
          <p>Select a category to edit its details.</p>
        </div>
      </aside>
    );
  }

  const colorOnly = hasChildren && !category.parentId;
  const displayError = localError ?? error;
  const accent = categoryColor(category.icon);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === category!.name) {
      setName(category!.name);
      return;
    }
    setLocalError(null);
    try {
      await onUpdate({ name: trimmed });
    } catch (reason) {
      setName(category!.name);
      setLocalError(
        reason instanceof Error ? reason.message : "Could not rename category.",
      );
    }
  }

  async function commitBudget() {
    const next = parseBudgetInput(budget);
    const current =
      category!.budgetCents == null || category!.budgetCents <= 0
        ? null
        : category!.budgetCents;
    if (next === current) {
      setBudget(moneyCentsToInput(current));
      return;
    }
    setLocalError(null);
    try {
      await onUpdate({ budgetCents: next });
      setBudget(moneyCentsToInput(next));
    } catch (reason) {
      setBudget(moneyCentsToInput(category!.budgetCents));
      setLocalError(
        reason instanceof Error ? reason.message : "Could not update budget.",
      );
    }
  }

  return (
    <aside className="finance-categories-view__detail" aria-label="Category details">
      <div className="finance-categories-view__detail-hero">
        <div className="finance-categories-view__detail-hero-main">
          <button
            type="button"
            className="finance-categories-view__detail-marks"
            aria-label={
              colorOnly
                ? `Change color for ${category.name}`
                : `Change icon for ${category.name}`
            }
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
              <CategoryIcon icon={category.icon} size={16} />
            </span>
          </button>
          <div className="finance-categories-view__detail-heading">
            <input
              ref={titleInputRef}
              className="finance-categories-view__detail-title-input"
              value={name}
              disabled={pending}
              aria-label="Category name"
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
                  setName(category.name);
                  event.currentTarget.blur();
                  return;
                }
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
            <label className="finance-categories-view__detail-budget-wrap">
              <span
                className="finance-categories-view__detail-budget-prefix"
                aria-hidden="true"
              >
                €
              </span>
              <input
                className="finance-categories-view__detail-budget-input"
                inputMode="decimal"
                aria-label="Monthly budget"
                placeholder="0"
                value={budget}
                disabled={pending}
                {...moneyInputContentWidth(budget)}
                onChange={(event) =>
                  setBudget(formatMoneyInput(event.target.value))
                }
                onBlur={() => {
                  void commitBudget();
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
            {formatSpentInMonthHeading(spentMonth)}
          </span>
          <span
            className={[
              "finance-categories-view__detail-spend-amount",
              spentCents > 0
                ? "is-debit"
                : spentCents < 0
                  ? "is-credit"
                  : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {formatMoney(spentCents === 0 ? 0 : -spentCents)}
          </span>
          <span className="finance-categories-view__detail-spend-left">
            {leftCents != null
              ? `${formatMoney(leftCents)} left`
              : "No budget set"}
          </span>
        </div>
      </div>

      <EntityIconPicker
        open={iconPickerOpen}
        value={
          colorOnly
            ? (() => {
                const parsed = parseEntityIcon(category.icon);
                const color =
                  parsed.kind === "default" || parsed.kind === "icon"
                    ? parsed.color
                    : undefined;
                return color
                  ? JSON.stringify({ t: "d", c: color })
                  : null;
              })()
            : category.icon
        }
        dialogTitle={colorOnly ? "Choose category color" : "Choose category icon"}
        colorOnly={colorOnly}
        onClose={() => setIconPickerOpen(false)}
        onSelect={(icon) => {
          setIconPickerOpen(false);
          setLocalError(null);
          void Promise.resolve(onUpdate({ icon })).catch((reason) => {
            setLocalError(
              reason instanceof Error
                ? reason.message
                : colorOnly
                  ? "Could not update color."
                  : "Could not update icon.",
            );
          });
        }}
        defaultOption={
          colorOnly
            ? undefined
            : {
                label: "Default category icon",
                preview: <DefaultProjectIcon size={16} />,
              }
        }
      />

      <CategorySpendChart
        categoryId={category.id}
        categoryName={category.name}
        accent={accent}
        months={metrics?.months ?? []}
        transactions={metrics?.transactions ?? []}
        childCategories={childCategories}
        budgetCents={chartBudgetCents}
        loading={metricsLoading}
      />

      <CategoryKeyMetrics
        years={metrics?.years ?? []}
        monthlyBudgetCents={chartBudgetCents}
        loading={metricsLoading}
      />

      <FinanceTransactionsPanelList
        transactions={metrics?.transactions ?? []}
        loading={metricsLoading}
        categories={categories}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        goals={goals}
        recurrings={recurrings}
        emptyLabel="No transactions in this category."
        listKeyboardNavZone={LIST_KEYBOARD_NAV_ZONE_CONTENT}
        onPatchTransaction={onPatchTransaction}
        onBulkPatchTransactions={onBulkPatchTransactions}
        onBulkDeleteTransactions={onBulkDeleteTransactions}
        onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
      />

      {displayError ? (
        <p className="entity-delete-modal-error" role="alert">
          {displayError}
        </p>
      ) : null}
    </aside>
  );
}

function yearBudgetCents(
  monthlyBudgetCents: number | null | undefined,
  year: number,
  asOf: Date = new Date(),
): number | null {
  if (monthlyBudgetCents == null || monthlyBudgetCents <= 0) return null;
  const currentYear = asOf.getFullYear();
  const months =
    year < currentYear
      ? 12
      : year === currentYear
        ? asOf.getMonth() + 1
        : 12;
  return monthlyBudgetCents * months;
}

function CategoryKeyMetrics({
  years,
  monthlyBudgetCents = null,
  loading,
}: {
  years: FinanceCategoryYearMetric[];
  /** Monthly budget in cents; shown year-over-year × months in each year. */
  monthlyBudgetCents?: number | null;
  loading: boolean;
}) {
  const rows = useMemo(() => {
    const asOf = new Date();
    const byYear = new Map(
      years.map((entry) => [entry.year, entry] as const),
    );
    if (
      byYear.size === 0 &&
      monthlyBudgetCents != null &&
      monthlyBudgetCents > 0
    ) {
      byYear.set(asOf.getFullYear(), {
        year: asOf.getFullYear(),
        spentCents: 0,
        avgMonthlyCents: 0,
      });
    }
    return [...byYear.values()]
      .sort((a, b) => b.year - a.year)
      .map((entry) => ({
        ...entry,
        budgetCents: yearBudgetCents(monthlyBudgetCents, entry.year, asOf),
      }));
  }, [monthlyBudgetCents, years]);

  return (
    <section className="finance-categories-view__metrics">
      <FinanceDetailSectionTitle>Key metrics</FinanceDetailSectionTitle>
      <div className="finance-categories-view__metrics-head">
        <span className="finance-categories-view__metrics-col finance-categories-view__metrics-col--start">
          Year
        </span>
        <span className="finance-categories-view__metrics-col">Spent</span>
        <span className="finance-categories-view__metrics-col">Budget</span>
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
            <span
              className={[
                "finance-categories-view__metrics-value",
                entry.spentCents > 0
                  ? "is-debit"
                  : entry.spentCents < 0
                    ? "is-credit"
                    : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {formatMoney(entry.spentCents === 0 ? 0 : -entry.spentCents)}
            </span>
            <span className="finance-categories-view__metrics-value">
              {entry.budgetCents != null ? formatMoney(entry.budgetCents) : "—"}
            </span>
          </div>
        ))
      ) : (
        <div className="finance-categories-view__metrics-empty">
          {loading ? "Loading metrics…" : "No spending recorded yet."}
        </div>
      )}
    </section>
  );
}
