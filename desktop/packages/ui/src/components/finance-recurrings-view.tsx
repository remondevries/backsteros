"use client";

import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";
import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { DEFAULT_ENTITY_ICON_COLOR } from "../entity/entity-icon.js";
import {
  applyOptimisticRecurringReorder,
  financeRecurringGroupAppendOrderKey,
  financeRecurringOrderKey,
  type FinanceListReorderRequest,
  type RecurringReorderGroup,
} from "../finance/finance-list-reorder.js";
import { useFinancePanelResize } from "../finance/use-finance-panel-resize.js";
import {
  useGroupedListPointerReorder,
  type GroupedListPointerItemBind,
} from "../list-nav/use-grouped-list-pointer-reorder.js";
import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../list-nav/keyboard-nav-item.js";
import {
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  LIST_KEYBOARD_NAV_ZONE_MAIN,
} from "../list-nav/list-keyboard-nav-zone.js";
import {
  ENTITY_TITLE_INPUT_ATTRIBUTE,
  useListDismissDetailShortcut,
} from "../list-nav/use-list-clear-selection-shortcut.js";
import {
  focusAndSelectTitleInput,
  useTitleRenameShortcut,
} from "../shortcuts/title-rename-shortcut.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "./list-keyboard-navigation-provider.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { EntityActionsMenu } from "./entity-actions/entity-actions-menu.js";
import { useEntityHeaderActionsContext } from "./entity-actions/entity-header-actions-context.js";
import { EntityDetailLayout } from "./entity-detail-layout.js";
import { EntityIconPicker } from "./entity-icon-picker.js";
import { FinanceDetailSectionTitle } from "./finance-detail-section-title.js";
import { resolveDropdownNone } from "./dropdown-options.js";
import {
  buildCategoryDropdownOptions,
  FinanceTransactionsPanelList,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
  type FinanceCategoryYearMetric,
} from "./finance-categories-view.js";
import { localMonthKey } from "./finance-month-navigator.js";
import {
  getDisplayProjectIcon,
  getEntityIconColor,
  ProjectOcticon,
} from "./project-octicon.js";
import { ProjectTypeGroupSection } from "./project-type-group-section.js";
import {
  formatMoneyInput,
  moneyCentsToInput,
  moneyInputContentWidth,
  parseMoneyInput,
} from "../finance/money-input.js";
import { advanceMonthlyNextDate } from "../finance/recurring-next-date.js";
import { RecurringYearChart } from "./recurring-year-chart.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import { TaskDueDateDropdown } from "./task-due-date-dropdown.js";

const FINANCE_RECURRING_DETAIL_WIDTH_KEY =
  "backsteros-desktop.finance-recurrings-detail-width";

export type RecurringDateGroup = "this_month" | "future" | "archived";

export type FinanceRecurringCreateInput = {
  name: string;
  /** Seed nextDate for the group the user created in. */
  nextDate: string | null;
  categoryId?: string | null;
  amountCents?: number | null;
  archived?: boolean;
};

export type FinanceRecurringUpdateInput = {
  name?: string;
  icon?: string | null;
  categoryId?: string | null;
  amountCents?: number | null;
  nextDate?: string | null;
  archived?: boolean;
  sortOrder?: number;
};

export type FinanceRecurringsChromeState = {
  hasSelection: boolean;
  detailCollapsed: boolean;
  detailResized: boolean;
  onToggleDetail: () => void;
  recurring: FinancialRecurring;
  onArchive: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export type FinanceRecurringMetrics = {
  recurringId: string;
  years: FinanceCategoryYearMetric[];
  transactions: FinancialTransaction[];
};

export type FinanceRecurringsViewProps = {
  recurrings: FinancialRecurring[];
  pending?: boolean;
  error?: string | null;
  categories?: FinancialCategory[];
  metrics?: FinanceRecurringMetrics | null;
  metricsLoading?: boolean;
  accounts?: BankAccount[];
  accountAvatarSrcById?: Record<string, string>;
  organizations?: FinanceCategoryOrganization[];
  goals?: FinancialGoal[];
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
  onChromeStateChange?: (state: FinanceRecurringsChromeState | null) => void;
  onSelectedRecurringChange?: (id: string | null) => void;
  onCreate: (
    input: FinanceRecurringCreateInput,
  ) =>
    | Promise<{ id: string } | void>
    | { id: string }
    | void;
  onUpdate: (
    id: string,
    patch: FinanceRecurringUpdateInput,
  ) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  /** Persist list order (and archived/nextDate when dropped across groups). */
  onReorder?: (request: FinanceListReorderRequest) => void;
};

const GROUP_OPTIONS: { id: RecurringDateGroup; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "future", label: "In the future" },
  { id: "archived", label: "Archived" },
];

function formatMoney(cents: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} €`;
  }
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return iso;
  }
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

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function firstOfNextMonthIso(): string {
  const now = new Date();
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function recurringDateGroup(
  nextDate: string | null | undefined,
  monthKey = localMonthKey(),
  asOf: Date = new Date(),
  archived = false,
): RecurringDateGroup {
  if (archived) return "archived";
  const effective = advanceMonthlyNextDate(nextDate, asOf);
  if (!effective || effective.length < 7) return "future";
  return effective.slice(0, 7) === monthKey ? "this_month" : "future";
}

function seedNextDateForGroup(group: RecurringDateGroup): string {
  return group === "this_month" ? todayIsoDate() : firstOfNextMonthIso();
}

function isRecurringArchived(
  recurring: { archived?: boolean | null } | null | undefined,
): boolean {
  return Boolean(recurring?.archived);
}

function RecurringIcon({
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

function RecurringKeyMetrics({
  years,
  loading,
}: {
  years: FinanceCategoryYearMetric[];
  loading: boolean;
}) {
  return (
    <section className="finance-categories-view__metrics">
      <FinanceDetailSectionTitle>Key metrics</FinanceDetailSectionTitle>
      <div className="finance-categories-view__metrics-head">
        <span className="finance-categories-view__metrics-col finance-categories-view__metrics-col--start">
          Year
        </span>
        <span className="finance-categories-view__metrics-col">
          Spent per year
        </span>
        <span className="finance-categories-view__metrics-col">
          Avg monthly spend
        </span>
      </div>
      {years.length ? (
        years.map((entry) => (
          <div
            key={entry.year}
            className="finance-categories-view__metrics-row"
          >
            <span className="finance-categories-view__metrics-year">
              {entry.year}
            </span>
            <span className="finance-categories-view__metrics-value">
              {formatMoney(entry.spentCents)}
            </span>
            <span className="finance-categories-view__metrics-value">
              {formatMoney(entry.avgMonthlyCents)}
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

type CreateModalState = { group: RecurringDateGroup } | null;

function CreateRecurringModal({
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

  const groupLabel =
    GROUP_OPTIONS.find((option) => option.id === state.group)?.label ??
    "Recurring";
  const title = `Add recurring — ${groupLabel}`;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-finance-recurring-create-modal=""
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
                placeholder="Rent"
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

function RecurringRow({
  recurring,
  selected,
  highlighted = false,
  onSelect,
  pointerReorderBind = null,
  dragging = false,
  showDragInsertBefore = false,
}: {
  recurring: FinancialRecurring;
  selected: boolean;
  highlighted?: boolean;
  onSelect: () => void;
  pointerReorderBind?: GroupedListPointerItemBind | null;
  dragging?: boolean;
  showDragInsertBefore?: boolean;
}) {
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
      {...keyboardNavItemProps(recurring.id)}
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
            <RecurringIcon icon={recurring.icon} size={16} />
          </span>
          <span className="finance-categories-view__row-meta">
            <span className="finance-categories-view__row-name">
              {recurring.name}
            </span>
          </span>
        </span>
        <span className="finance-categories-view__amounts" aria-hidden="true">
          <span className="finance-categories-view__amount finance-categories-view__amount--spent">
            {recurring.amountCents != null && recurring.amountCents > 0
              ? formatMoney(recurring.amountCents)
              : "—"}
          </span>
          <span
            className="finance-categories-view__amounts-spacer"
            aria-hidden="true"
          />
          <span className="finance-categories-view__amount finance-categories-view__amount--budget">
            {formatDateShort(
              isRecurringArchived(recurring)
                ? recurring.nextDate
                : advanceMonthlyNextDate(recurring.nextDate),
            )}
          </span>
        </span>
        <span className="finance-categories-view__row-action-spacer" />
      </div>
    </li>
  );
}

function RecurringDetailPanel({
  recurring,
  pending,
  error,
  categories,
  metrics,
  metricsLoading,
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
  recurring: FinancialRecurring | null;
  pending: boolean;
  error: string | null;
  categories: FinancialCategory[];
  metrics: FinanceRecurringMetrics | null;
  metricsLoading: boolean;
  accounts: BankAccount[];
  accountAvatarSrcById: Record<string, string>;
  organizations: FinanceCategoryOrganization[];
  goals: FinancialGoal[];
  recurrings: FinancialRecurring[];
  onPatchTransaction?: FinanceRecurringsViewProps["onPatchTransaction"];
  onBulkPatchTransactions?: FinanceRecurringsViewProps["onBulkPatchTransactions"];
  onBulkDeleteTransactions?: FinanceRecurringsViewProps["onBulkDeleteTransactions"];
  onCreateOrganizationFromQuery?: FinanceRecurringsViewProps["onCreateOrganizationFromQuery"];
  onUpdate: (patch: FinanceRecurringUpdateInput) => void | Promise<void>;
}) {
  const [name, setName] = useState(recurring?.name ?? "");
  const [amount, setAmount] = useState(
    moneyCentsToInput(recurring?.amountCents),
  );
  const [nextDate, setNextDate] = useState<string | null>(
    advanceMonthlyNextDate(recurring?.nextDate ?? null),
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    recurring?.categoryId ?? null,
  );
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useTitleRenameShortcut(
    useCallback(() => {
      focusAndSelectTitleInput(titleInputRef.current);
    }, []),
    { enabled: Boolean(recurring) },
  );

  useEffect(() => {
    if (!recurring) return;
    setName(recurring.name);
    setAmount(moneyCentsToInput(recurring.amountCents));
    setNextDate(
      isRecurringArchived(recurring)
        ? recurring.nextDate
        : advanceMonthlyNextDate(recurring.nextDate),
    );
    setCategoryId(recurring.categoryId);
    setLocalError(null);
  }, [recurring]);

  const categoryOptions = useMemo(
    () => buildCategoryDropdownOptions(categories),
    [categories],
  );
  const selectedCategory = useMemo(
    () => categories.find((entry) => entry.id === categoryId) ?? null,
    [categories, categoryId],
  );
  const categoryAccent =
    getEntityIconColor(selectedCategory?.icon) ?? DEFAULT_ENTITY_ICON_COLOR;

  const accent =
    getEntityIconColor(recurring?.icon) ?? DEFAULT_ENTITY_ICON_COLOR;
  const displayError = localError ?? error;
  const year = new Date().getFullYear();
  const transactions = metrics?.transactions ?? [];
  const years = metrics?.years ?? [];

  if (!recurring) {
    return (
      <aside
        className="finance-categories-view__detail"
        aria-label="Recurring details"
      >
        <div className="finance-categories-view__detail-empty">
          Select a recurring to view details.
        </div>
      </aside>
    );
  }

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === recurring!.name) {
      setName(recurring!.name);
      return;
    }
    setLocalError(null);
    try {
      await onUpdate({ name: trimmed });
    } catch (reason) {
      setName(recurring!.name);
      setLocalError(
        reason instanceof Error ? reason.message : "Could not update name.",
      );
    }
  }

  async function commitAmount() {
    const next = parseMoneyInput(amount);
    const current =
      recurring!.amountCents == null || recurring!.amountCents <= 0
        ? null
        : recurring!.amountCents;
    if (next === current) {
      setAmount(moneyCentsToInput(current));
      return;
    }
    setLocalError(null);
    try {
      await onUpdate({ amountCents: next });
      setAmount(moneyCentsToInput(next));
    } catch (reason) {
      setAmount(moneyCentsToInput(recurring!.amountCents));
      setLocalError(
        reason instanceof Error ? reason.message : "Could not update amount.",
      );
    }
  }

  async function commitNextDate(value: string | null) {
    const archived = isRecurringArchived(recurring!);
    const normalized = archived
      ? value
      : advanceMonthlyNextDate(value);
    const stored = archived
      ? (recurring!.nextDate ?? null)
      : advanceMonthlyNextDate(recurring!.nextDate);
    if (normalized === stored) {
      setNextDate(stored);
      return;
    }
    setLocalError(null);
    setNextDate(normalized);
    try {
      await onUpdate({ nextDate: normalized });
    } catch (reason) {
      setNextDate(stored);
      setLocalError(
        reason instanceof Error ? reason.message : "Could not update date.",
      );
    }
  }

  async function commitCategory(next: string | null) {
    if (next === (recurring!.categoryId ?? null)) return;
    setLocalError(null);
    const previous = categoryId;
    setCategoryId(next);
    try {
      await onUpdate({ categoryId: next });
    } catch (reason) {
      setCategoryId(previous);
      setLocalError(
        reason instanceof Error
          ? reason.message
          : "Could not update category.",
      );
    }
  }

  return (
    <aside
      className="finance-categories-view__detail finance-recurrings-view__detail"
      aria-label="Recurring details"
    >
      <div className="finance-recurrings-view__detail-hero">
        <div className="finance-recurrings-view__detail-hero-left">
          <SearchableDropdown
            ariaLabel="Category"
            className="finance-recurrings-view__category-dropdown"
            value={categoryId}
            options={categoryOptions}
            disabled={pending}
            searchPlaceholder="Category"
            panelWidth={240}
            renderTrigger={({ selected, open, disabled, triggerId, onToggle }) => (
              <button
                type="button"
                id={triggerId}
                className={[
                  "finance-recurrings-view__category-chip",
                  !selectedCategory ? "is-empty" : null,
                  open ? "is-open" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  selectedCategory
                    ? ({
                        "--recurring-cat-accent": categoryAccent,
                      } as CSSProperties)
                    : undefined
                }
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label="Category"
                onClick={onToggle}
              >
                {selectedCategory ? (
                  <span
                    className="finance-recurrings-view__category-chip-icon"
                    aria-hidden="true"
                  >
                    <RecurringIcon icon={selectedCategory.icon} size={14} />
                  </span>
                ) : null}
                <span className="finance-recurrings-view__category-chip-label">
                  {selected?.label ??
                    selectedCategory?.name ??
                    "No category"}
                </span>
              </button>
            )}
            onChange={(value) => {
              void commitCategory(resolveDropdownNone(value));
            }}
          />

          <div className="finance-recurrings-view__identity">
            <button
              type="button"
              className="finance-recurrings-view__name-icon"
              aria-label={`Change icon for ${recurring.name}`}
              disabled={pending}
              onClick={() => setIconPickerOpen(true)}
              style={{ color: accent }}
            >
              <RecurringIcon icon={recurring.icon} size={28} />
            </button>
            <input
              ref={titleInputRef}
              className="finance-recurrings-view__title-input"
              value={name}
              disabled={pending}
              aria-label="Recurring name"
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
                  setName(recurring.name);
                  event.currentTarget.blur();
                  return;
                }
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>

        <div className="finance-recurrings-view__detail-hero-right">
          <span className="finance-recurrings-view__field-label">
            Next payment
          </span>
          <label className="finance-recurrings-view__amount-wrap">
            <span
              className="finance-recurrings-view__amount-prefix"
              aria-hidden="true"
            >
              €
            </span>
            <input
              className="finance-recurrings-view__amount-input"
              inputMode="decimal"
              aria-label="Next payment amount"
              placeholder="0"
              value={amount}
              disabled={pending}
              {...moneyInputContentWidth(amount)}
              onChange={(event) =>
                setAmount(formatMoneyInput(event.target.value))
              }
              onBlur={() => {
                void commitAmount();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <div className="finance-recurrings-view__around-row">
            <span className="finance-recurrings-view__around-label">around</span>
            <TaskDueDateDropdown
              dueDate={parseCalendarDate(nextDate)}
              variant="property"
              triggerVariant="inlineChip"
              noDueDateLabel="No date"
              searchPlaceholder="today, next monday…"
              taskPropertyDropdownId="dueDate"
              showIcon={false}
              disabled={pending}
              onDueDateChange={(date) => {
                void commitNextDate(date ? formatCalendarDate(date) : null);
              }}
            />
          </div>
        </div>
      </div>

      <RecurringYearChart
        year={year}
        transactions={transactions}
        targetAmountCents={
          parseMoneyInput(amount) ?? recurring.amountCents ?? null
        }
        loading={metricsLoading}
      />

      <RecurringKeyMetrics years={years} loading={metricsLoading} />

      <FinanceTransactionsPanelList
        transactions={transactions}
        loading={metricsLoading}
        categories={categories}
        accounts={accounts}
        accountAvatarSrcById={accountAvatarSrcById}
        organizations={organizations}
        goals={goals}
        recurrings={recurrings}
        emptyLabel="No transactions linked to this recurring."
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

      {iconPickerOpen ? (
        <EntityIconPicker
          open
          value={recurring.icon}
          dialogTitle="Choose recurring icon"
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
            label: "Default recurring icon",
            preview: <DefaultProjectIcon size={16} />,
          }}
        />
      ) : null}
    </aside>
  );
}

export function RecurringActionsMenu({
  recurring,
  onArchive,
  onDelete,
  disabled = false,
}: {
  recurring: FinancialRecurring;
  onArchive: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { openDeleteModal, isDeletePending } = useEntityHeaderActionsContext();
  const archived = isRecurringArchived(recurring);

  return (
    <EntityActionsMenu
      ariaLabel={`Actions for ${recurring.name}`}
      triggerAriaLabel="Recurring actions"
      disabled={disabled || isDeletePending}
      items={[
        {
          id: "archive",
          label: archived ? "Unarchive" : "Archive",
          disabled: isDeletePending,
          onSelect: () => {
            void Promise.resolve(onArchive());
          },
        },
        {
          id: "delete",
          label: "Delete recurring",
          danger: true,
          disabled: isDeletePending,
          onSelect: () => {
            openDeleteModal({
              entityLabel: recurring.name,
              confirmLabel: "Delete recurring",
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
                        : "Could not delete recurring.",
                  };
                }
              },
            });
          },
        },
      ]}
    />
  );
}

export function FinanceRecurringsView({
  recurrings,
  pending = false,
  error = null,
  categories = [],
  metrics = null,
  metricsLoading = false,
  accounts = [],
  accountAvatarSrcById = {},
  organizations = [],
  goals = [],
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
  onChromeStateChange,
  onSelectedRecurringChange,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: FinanceRecurringsViewProps) {
  const monthKey = localMonthKey();
  const [localRecurrings, setLocalRecurrings] = useState(recurrings);
  useEffect(() => {
    setLocalRecurrings(recurrings);
  }, [recurrings]);

  const resolveRecurringGroup = useCallback(
    (row: FinancialRecurring): RecurringReorderGroup =>
      recurringDateGroup(
        row.nextDate,
        monthKey,
        new Date(),
        isRecurringArchived(row),
      ),
    [monthKey],
  );

  const applyRecurringGroup = useCallback(
    (
      row: FinancialRecurring,
      group: RecurringReorderGroup,
    ): FinancialRecurring => {
      if (group === "archived") {
        return { ...row, archived: true };
      }
      if (resolveRecurringGroup(row) === group) {
        return { ...row, archived: false };
      }
      return {
        ...row,
        archived: false,
        nextDate: seedNextDateForGroup(group),
      };
    },
    [resolveRecurringGroup],
  );

  const groups = useMemo(() => {
    const sorted = [...localRecurrings].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    return GROUP_OPTIONS.map((group) => ({
      ...group,
      items: sorted.filter((row) => resolveRecurringGroup(row) === group.id),
    }));
  }, [localRecurrings, resolveRecurringGroup]);

  const [collapsed, setCollapsed] = useState<
    Partial<Record<RecurringDateGroup, boolean>>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [createState, setCreateState] = useState<CreateModalState>(null);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const rolledNextDatesRef = useRef(new Set<string>());
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const canReorder = Boolean(onReorder);

  const handleRecurringReorder = useCallback(
    (request: FinanceListReorderRequest) => {
      setLocalRecurrings((current) =>
        applyOptimisticRecurringReorder(
          current,
          request,
          resolveRecurringGroup,
          applyRecurringGroup,
        ),
      );
      if (request.fromGroupKey !== request.toGroupKey) {
        setCollapsed((current) => ({
          ...current,
          [request.toGroupKey as RecurringDateGroup]: false,
        }));
      }
      onReorder?.(request);
    },
    [applyRecurringGroup, onReorder, resolveRecurringGroup],
  );

  const getItemGroupKey = useCallback(
    (itemId: string) => {
      const row = localRecurrings.find((entry) => entry.id === itemId);
      return row ? resolveRecurringGroup(row) : undefined;
    },
    [localRecurrings, resolveRecurringGroup],
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
    itemOrderKey: financeRecurringOrderKey,
    groupAppendOrderKey: (groupKey) =>
      financeRecurringGroupAppendOrderKey(groupKey as RecurringReorderGroup),
    onReorder: handleRecurringReorder,
  });

  const selectRecurring = useCallback(
    (id: string) => {
      if (consumeClickSuppression()) return;
      setSelectedId(id);
      setDetailCollapsed(false);
    },
    [consumeClickSuppression],
  );

  const closeRecurringDetail = useCallback(() => {
    setSelectedId(null);
  }, []);

  useListDismissDetailShortcut({
    enabled: selectedId != null,
    onDismiss: closeRecurringDetail,
  });

  const keyboardItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groups) {
      if (collapsed[group.id]) continue;
      for (const row of group.items) {
        ids.push(row.id);
      }
    }
    return ids;
  }, [collapsed, groups]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds: keyboardItemIds,
    selectedId,
    onNavigate: selectRecurring,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: keyboardItemIds.length > 0,
  });

  // Persist rolled-forward next dates so past months do not stick as "future".
  // Archived recurrings keep their stored nextDate unchanged.
  useEffect(() => {
    for (const row of recurrings) {
      if (isRecurringArchived(row)) continue;
      const advanced = advanceMonthlyNextDate(row.nextDate);
      if (!advanced || advanced === (row.nextDate ?? null)) continue;
      const key = `${row.id}:${row.nextDate ?? ""}`;
      if (rolledNextDatesRef.current.has(key)) continue;
      rolledNextDatesRef.current.add(key);
      void Promise.resolve(onUpdate(row.id, { nextDate: advanced }));
    }
  }, [onUpdate, recurrings]);

  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    isResized: detailResized,
    beginResize: beginDetailResize,
    resetWidth: resetDetailWidth,
  } = useFinancePanelResize(FINANCE_RECURRING_DETAIL_WIDTH_KEY);

  const selected =
    localRecurrings.find((entry) => entry.id === selectedId) ?? null;

  useEffect(() => {
    if (
      selectedId &&
      !localRecurrings.some((entry) => entry.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [localRecurrings, selectedId]);

  useEffect(() => {
    onSelectedRecurringChange?.(selectedId);
  }, [onSelectedRecurringChange, selectedId]);

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
      recurring: target,
      onArchive: async () => {
        await Promise.resolve(
          onUpdate(target.id, { archived: !isRecurringArchived(target) }),
        );
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
    <EntityDetailLayout sectionLabel="Finance" title="Recurrings">
      <div
        ref={containerRef}
        className={[
          "finance-categories-view",
          "finance-recurrings-view",
          selected ? "has-selection" : null,
          selected && detailCollapsed ? "is-detail-collapsed" : null,
          detailWidth != null ? "is-detail-resized" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          detailWidth != null
            ? ({ "--finance-cat-detail-w": `${detailWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="finance-categories-view__list-pane">
          <ul
            className="overview-grouped-list"
            role="list"
            ref={listRef}
            {...listContainerProps}
          >
            {groups.map((group) => {
              const isCollapsed = Boolean(collapsed[group.id]);
              const appendKey = financeRecurringGroupAppendOrderKey(group.id);
              return (
                <ProjectTypeGroupSection
                  key={group.id}
                  title={`${group.label} (${group.items.length})`}
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
                    setCreateState({ group: group.id });
                  }}
                  addActionLabel="recurring"
                  pointerReorderAppend={
                    canReorder ? bindAppendZone(group.id) : null
                  }
                  showPointerAppendIndicator={insertBeforeKey === appendKey}
                  trailing={
                    group.id === "this_month" ? (
                      <span className="finance-categories-view__column-headers">
                        <span>Amount</span>
                        <span
                          className="finance-categories-view__column-headers-gap"
                          aria-hidden="true"
                        />
                        <span>Next</span>
                      </span>
                    ) : null
                  }
                >
                  {group.items.length === 0 ? (
                    <li className="finance-categories-view__group-empty">
                      Nothing here yet
                    </li>
                  ) : (
                    group.items.map((row) => (
                      <RecurringRow
                        key={row.id}
                        recurring={row}
                        selected={selectedId === row.id}
                        highlighted={highlightedId === row.id}
                        onSelect={() => selectRecurring(row.id)}
                        pointerReorderBind={
                          canReorder
                            ? bindItem(row.id, resolveRecurringGroup(row))
                            : null
                        }
                        dragging={draggingItemId === row.id}
                        showDragInsertBefore={
                          insertBeforeKey === financeRecurringOrderKey(row.id)
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
            aria-label="Resize recurring panel"
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
          <RecurringDetailPanel
            recurring={selected}
            pending={pending}
            error={error}
            categories={categories}
            metrics={metrics}
            metricsLoading={metricsLoading}
            accounts={accounts}
            accountAvatarSrcById={accountAvatarSrcById}
            organizations={organizations}
            goals={goals}
            recurrings={localRecurrings}
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

      <CreateRecurringModal
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
            const result = await onCreate({
              name,
              nextDate: seedNextDateForGroup(createState.group),
              archived: createState.group === "archived",
            });
            setCreateState(null);
            if (result && typeof result === "object" && "id" in result) {
              setSelectedId(result.id);
            }
          } catch (reason) {
            setCreateError(
              reason instanceof Error
                ? reason.message
                : "Could not create recurring.",
            );
          } finally {
            setCreatePending(false);
          }
        }}
      />
    </EntityDetailLayout>
  );
}
