"use client";

import { TrashIcon } from "@primer/octicons-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { FINANCE_BULK_SCOPE_ATTRIBUTE } from "../tasks/task-property-dropdown-keys.js";

export type FinanceBulkBarProps = {
  selectionCount: number;
  /** Dropdowns / field editors rendered between Select all and Clear. */
  children?: ReactNode;
  /** Optional dock wrapper class (panel vs full transactions list). */
  dockClassName?: string;
  /** Toolbar accessible name (default: transactions). */
  ariaLabel?: string;
  /** Noun used in the delete confirmation copy (default: transaction). */
  deleteEntityLabel?: string;
  showSelectAll?: boolean;
  selectAllPending?: boolean;
  onSelectAll?: () => void | Promise<void>;
  onClear: () => void;
  /**
   * When set, shows Apply. Callers stage dropdown changes locally and commit
   * only when Apply is pressed.
   */
  onApply?: () => void | Promise<void>;
  /** True when at least one staged bulk field is ready to commit. */
  applyEnabled?: boolean;
  applyPending?: boolean;
  /**
   * When set, shows the red trash control and a shared delete confirmation
   * modal. Called only after the user confirms.
   */
  onDelete?: () => void | Promise<void>;
};

/**
 * When every selected row shares the same value, return it; otherwise `null`
 * (caller shows the placeholder label for a mixed selection).
 */
export function sharedSelectionValue<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null;
  const first = values[0] as T;
  for (let i = 1; i < values.length; i += 1) {
    if (!Object.is(values[i], first)) return null;
  }
  return first;
}

/**
 * Shared nullable id for bulk dropdowns. Returns:
 * - the common id when every row matches
 * - `noneValue` when every row is unset (so the None option label shows)
 * - `null` when values are mixed (placeholder label)
 */
export function sharedNullableIdSelectionValue(
  values: readonly (string | null | undefined)[],
  noneValue: string,
): string | null {
  if (values.length === 0) return null;
  const normalized = values.map((value) => value ?? null);
  const first = normalized[0] ?? null;
  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i] !== first) return null;
  }
  return first ?? noneValue;
}

/**
 * Whether a bulk dropdown trigger should show an option icon.
 * Placeholders / mixed / explicit “none” sentinels stay icon-free.
 */
export function bulkDropdownShowIcon(
  value: string | null,
  noneValue?: string,
): boolean {
  if (value == null) return false;
  if (noneValue != null && value === noneValue) return false;
  return true;
}

/**
 * Compose + empty/filled chrome for bulk SearchableDropdown triggers.
 * Empty (unset / none sentinel / mixed) → dashed; filled → solid.
 */
export function withBulkDropdownFillState(
  baseTriggerClassName: string,
  value: string | null,
  noneValue?: string,
): string {
  return [
    baseTriggerClassName,
    bulkDropdownShowIcon(value, noneValue) ? "is-filled" : "is-empty",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Relabel a none/clear sentinel option so bulk chrome shows the property name
 * (e.g. "Organization") instead of "No organization".
 */
export function relabelDropdownNoneOption<
  T extends { value: string; label: string; searchTerms?: string },
>(options: T[], noneValue: string, label: string): T[] {
  return options.map((option) =>
    option.value === noneValue
      ? {
          ...option,
          label,
          searchTerms: [option.searchTerms, label, "none clear"]
            .filter(Boolean)
            .join(" "),
        }
      : option,
  );
}

/**
 * Shared floating bulk editor for transaction multi-select (main list and
 * right-hand panels). Keeps Select all / Clear / Delete consistent everywhere.
 */
export function FinanceBulkBar({
  selectionCount,
  children,
  dockClassName = "finance-bulk-bar-dock",
  ariaLabel = "Bulk edit selected transactions",
  deleteEntityLabel = "transaction",
  showSelectAll = false,
  selectAllPending = false,
  onSelectAll,
  onClear,
  onApply,
  applyEnabled = false,
  applyPending = false,
  onDelete,
}: FinanceBulkBarProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const deleteTitleId = useId();
  const applyInFlight = applyPending || applyBusy;

  useEffect(() => {
    if (!deleteOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!deletePending) {
        setDeleteOpen(false);
        setDeleteError(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [deleteOpen, deletePending]);

  if (selectionCount <= 0) return null;

  const closeDeleteModal = () => {
    if (deletePending) return;
    setDeleteOpen(false);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!onDelete || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : `Could not delete selected ${deleteEntityLabel}s.`,
      );
    } finally {
      setDeletePending(false);
    }
  };

  const runApply = async () => {
    if (!onApply || !applyEnabled || applyInFlight) return;
    setApplyBusy(true);
    try {
      await onApply();
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <>
      <div className={dockClassName}>
        <div
          className="finance-bulk-bar"
          role="toolbar"
          aria-label={ariaLabel}
          {...{ [FINANCE_BULK_SCOPE_ATTRIBUTE]: "" }}
        >
          <span className="finance-bulk-bar__count">
            {selectionCount} selected
          </span>
          {showSelectAll && onSelectAll ? (
            <button
              type="button"
              className="finance-bulk-bar__select-all"
              disabled={selectAllPending || applyInFlight}
              onClick={() => {
                void onSelectAll();
              }}
            >
              {selectAllPending ? "loading..." : "Select all"}
            </button>
          ) : null}
          {children}
          {onApply ? (
            <button
              type="button"
              className="finance-bulk-bar__apply"
              disabled={!applyEnabled || applyInFlight}
              onClick={() => {
                void runApply();
              }}
            >
              {applyInFlight ? "Applying…" : "Apply"}
            </button>
          ) : null}
          <button
            type="button"
            className="finance-bulk-bar__clear"
            disabled={applyInFlight}
            onClick={onClear}
          >
            Clear
          </button>
          {onDelete ? (
            <button
              type="button"
              className="finance-bulk-bar__delete"
              aria-label={`Delete ${selectionCount} selected ${deleteEntityLabel}${selectionCount === 1 ? "" : "s"}`}
              title="Delete selected"
              disabled={applyInFlight}
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              <TrashIcon size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {deleteOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="entity-delete-modal-root"
              data-blocking-modal=""
              data-finance-bulk-delete-modal=""
            >
              <button
                type="button"
                aria-label="Cancel delete"
                className="entity-delete-modal-backdrop"
                onClick={closeDeleteModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={deleteTitleId}
                className="entity-delete-modal"
              >
                <h2 id={deleteTitleId} className="entity-delete-modal-title">
                  Delete {selectionCount}{" "}
                  {selectionCount === 1
                    ? deleteEntityLabel
                    : `${deleteEntityLabel}s`}
                  ?
                </h2>
                <p className="entity-delete-modal-body">
                  This permanently removes the selected {deleteEntityLabel}s.
                  This action cannot be undone.
                </p>
                {deleteError ? (
                  <p className="entity-delete-modal-error" role="alert">
                    {deleteError}
                  </p>
                ) : null}
                <div className="entity-delete-modal-actions">
                  <button
                    type="button"
                    disabled={deletePending}
                    onClick={closeDeleteModal}
                    className="entity-delete-modal-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deletePending}
                    onClick={() => {
                      void confirmDelete();
                    }}
                    className="entity-delete-modal-confirm"
                  >
                    {deletePending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
