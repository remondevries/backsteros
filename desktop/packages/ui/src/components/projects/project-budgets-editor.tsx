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
};

type EditorRow = {
  period: ProjectBudgetPeriod;
  amountText: string;
};

const PERIOD_OPTIONS = PROJECT_BUDGET_PERIODS.map((value) => ({
  value,
  label: getProjectBudgetPeriodLabel(value),
}));

function rowFromBudgets(budgets: readonly ProjectBudgetEntry[]): EditorRow {
  const entry = budgets[0];
  if (!entry) {
    return { period: "monthly", amountText: "" };
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
 * Single budget pill: period dropdown | € amount.
 * Keeps a local committed row so a lagging empty prop cannot flash back to 0.
 */
export function ProjectBudgetsEditor({
  budgets,
  disabled = false,
  onChange,
  onSave,
}: ProjectBudgetsEditorProps) {
  const committedRef = useRef<ProjectBudgetEntry[] | undefined>(undefined);
  const propKey = budgetsKey(budgets);
  if (
    committedRef.current !== undefined &&
    budgetsKey(committedRef.current) === propKey
  ) {
    committedRef.current = undefined;
  }

  const effectiveBudgets = committedRef.current ?? budgets;
  const remoteRow = rowFromBudgets(effectiveBudgets);
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
        ? rowFromBudgets(entries)
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
          <span className="project-budget-chip__currency" aria-hidden>
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
            className="contact-detail-split-chip__value"
          />
        </div>
      </div>
    </div>
  );
}
