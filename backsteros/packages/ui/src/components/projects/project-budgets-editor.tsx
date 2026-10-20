"use client";

import { useRef, useState } from "react";
import {
  getProjectBudgetPeriodLabel,
  normalizeProjectBudgetEntries,
  normalizeProjectBudgetPeriod,
  PROJECT_BUDGET_PERIODS,
  type ProjectBudgetEntry,
  type ProjectBudgetPeriod,
} from "@backsteros/contracts";

import {
  formatMoneyInput,
  moneyCentsToInput,
  parseMoneyInput,
} from "../../finance/money-input.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";

export type { ProjectBudgetEntry, ProjectBudgetPeriod };

export type ProjectBudgetsEditorProps = {
  budgets: readonly ProjectBudgetEntry[];
  disabled?: boolean;
  onChange?: (next: ProjectBudgetEntry[]) => void;
  onSave: (next: ProjectBudgetEntry[]) => void;
  /**
   * `split` — period dropdown | € amount (full project detail).
   * `chip` — € amount only (panel overview; period kept in data).
   */
  variant?: "split" | "chip";
  /** Period used when creating a new budget in `chip` mode (default weekly). */
  chipPeriod?: ProjectBudgetPeriod;
};

type EditorRow = {
  period: ProjectBudgetPeriod;
  amountText: string;
};

const PERIOD_OPTIONS = PROJECT_BUDGET_PERIODS.map((value) => ({
  value,
  label: getProjectBudgetPeriodLabel(value),
}));

function rowFromBudgets(
  budgets: readonly ProjectBudgetEntry[],
  fallbackPeriod: ProjectBudgetPeriod,
): EditorRow {
  const entry = budgets[0];
  if (!entry) {
    return { period: fallbackPeriod, amountText: "" };
  }
  return {
    period: entry.period,
    amountText: moneyCentsToInput(entry.amountCents, { alwaysFraction: true }),
  };
}

function budgetsKey(budgets: readonly ProjectBudgetEntry[]): string {
  return JSON.stringify(budgets);
}

function toEntries(row: EditorRow): ProjectBudgetEntry[] {
  return normalizeProjectBudgetEntries([
    {
      period: row.period,
      amountCents: parseMoneyInput(row.amountText, { positive: true }),
    },
  ]);
}

/**
 * Budget amount editor — split pill with period, or value-only property chip.
 */
export function ProjectBudgetsEditor({
  budgets,
  disabled = false,
  onChange,
  onSave,
  variant = "split",
  chipPeriod = "weekly",
}: ProjectBudgetsEditorProps) {
  const fallbackPeriod = variant === "chip" ? chipPeriod : "monthly";
  const committedRef = useRef<ProjectBudgetEntry[] | undefined>(undefined);
  const propKey = budgetsKey(budgets);
  if (
    committedRef.current !== undefined &&
    budgetsKey(committedRef.current) === propKey
  ) {
    committedRef.current = undefined;
  }

  const effectiveBudgets = committedRef.current ?? budgets;
  const remoteRow = rowFromBudgets(effectiveBudgets, fallbackPeriod);
  const [row, setRow] = useState(remoteRow);
  const [editing, setEditing] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const remoteKey = `${remoteRow.period}:${remoteRow.amountText}`;
  const [shownRemoteKey, setShownRemoteKey] = useState(remoteKey);

  if (!editing && remoteKey !== shownRemoteKey) {
    setShownRemoteKey(remoteKey);
    setRow(remoteRow);
  }

  function setLocalRow(next: EditorRow) {
    setRow(next);
    onChange?.(toEntries(next));
  }

  function commitRow(next: EditorRow) {
    const entries = toEntries(next);
    const resolved =
      entries.length > 0
        ? rowFromBudgets(entries, fallbackPeriod)
        : { period: next.period, amountText: "" };
    committedRef.current = entries;
    setRow(resolved);
    setEditing(false);
    setShownRemoteKey(`${resolved.period}:${resolved.amountText}`);
    onChange?.(entries);
    onSave(entries);
  }

  function commitPeriod(period: string) {
    const next = {
      ...row,
      period: normalizeProjectBudgetPeriod(period),
    };
    setLocalRow(next);
    if (parseMoneyInput(next.amountText, { positive: true })) {
      commitRow(next);
    }
  }

  function commitAmount(amountText: string) {
    commitRow({
      ...row,
      amountText: formatMoneyInput(amountText),
    });
  }

  const label = getProjectBudgetPeriodLabel(row.period);

  const amountInput = (
    <>
      <span
        className={
          variant === "chip"
            ? "project-billing-value-chip__currency"
            : "project-budget-chip__currency"
        }
        aria-hidden
      >
        €
      </span>
      <input
        ref={amountInputRef}
        type="text"
        inputMode="decimal"
        aria-label="Budget amount"
        value={row.amountText}
        disabled={disabled}
        placeholder="0,00"
        size={Math.max(row.amountText.length, "0,00".length, 4)}
        onFocus={() => setEditing(true)}
        onChange={(event) =>
          setLocalRow({
            ...row,
            amountText: formatMoneyInput(event.target.value),
          })
        }
        onBlur={(event) => commitAmount(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
        }}
        className={
          variant === "chip"
            ? "project-billing-value-chip__value"
            : "contact-detail-split-chip__value"
        }
      />
    </>
  );

  if (variant === "chip") {
    return (
      <div
        className={[
          "property-dropdown-trigger",
          "property-dropdown-trigger--inline-chip",
          "project-billing-value-chip",
          disabled ? "property-dropdown-trigger--static" : null,
          !row.amountText.trim() ? "is-muted" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (!disabled) amountInputRef.current?.focus();
        }}
      >
        {amountInput}
      </div>
    );
  }

  return (
    <div className="contact-detail-chips">
      <div className="contact-detail-chips__row">
        <div
          className={[
            "contact-detail-split-chip",
            "project-billing-chip",
            "project-budget-chip",
            !row.amountText.trim() ? "is-muted" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <SearchableDropdown
            value={row.period}
            options={[...PERIOD_OPTIONS]}
            disabled={disabled}
            searchPlaceholder="Period…"
            searchShortcutLabel=""
            ariaLabel="Budget period"
            panelAlign="start"
            panelWidth={160}
            showIcon={false}
            className="contact-detail-split-chip__dropdown"
            onChange={commitPeriod}
            renderTrigger={({ selected, open, triggerId, onToggle }) => (
              <button
                type="button"
                id={triggerId}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`Budget period: ${selected?.label ?? label}`}
                title={selected?.label ?? label}
                onClick={onToggle}
                className={[
                  "contact-detail-split-chip__label",
                  "contact-detail-split-chip__label--muted",
                  open ? "is-open" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {selected?.label ?? label}
              </button>
            )}
          />
          {amountInput}
        </div>
      </div>
    </div>
  );
}
