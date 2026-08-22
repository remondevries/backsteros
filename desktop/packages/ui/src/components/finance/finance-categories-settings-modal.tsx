"use client";

import { TrashIcon } from "@primer/octicons-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import type {
  FinancialCategory,
  FinancialCategoryKind,
} from "@backsteros/contracts";

export type FinanceCategoriesSettingsModalProps = {
  open: boolean;
  categories: FinancialCategory[];
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    kind: FinancialCategoryKind;
  }) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

const KIND_OPTIONS: Array<{ value: FinancialCategoryKind; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

export function FinanceCategoriesSettingsModal({
  open,
  categories,
  pending = false,
  error = null,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: FinanceCategoriesSettingsModalProps) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FinancialCategoryKind>("expense");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setKind("expense");
    setLocalError(null);
    setBusyId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, open]);

  if (!open) return null;

  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  const displayError = localError ?? error;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-finance-categories-settings-modal=""
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
        className="entity-delete-modal finance-categories-settings-modal"
      >
        <h2 id={titleId} className="entity-delete-modal-title">
          Finance settings
        </h2>
        <p className="entity-delete-modal-body">
          Categories are global and available for every bank account.
        </p>

        <form
          className="finance-categories-settings-modal__create"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed || pending) return;
            setLocalError(null);
            void Promise.resolve(onCreate({ name: trimmed, kind }))
              .then(() => {
                setName("");
                setKind("expense");
              })
              .catch((reason) => {
                setLocalError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not create category.",
                );
              });
          }}
        >
          <label className="finance-categories-settings-modal__field">
            <span className="finance-categories-settings-modal__label">
              New category
            </span>
            <input
              className="finance-categories-settings-modal__input"
              value={name}
              disabled={pending}
              placeholder="Groceries"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="finance-categories-settings-modal__field finance-categories-settings-modal__field--kind">
            <span className="finance-categories-settings-modal__label">Kind</span>
            <select
              className="finance-categories-settings-modal__input"
              value={kind}
              disabled={pending}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value !== "expense" &&
                  value !== "income" &&
                  value !== "transfer"
                ) {
                  return;
                }
                setKind(value);
              }}
            >
              {KIND_OPTIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="finance-bank-account-modal__save"
            disabled={pending || !name.trim()}
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </form>

        <ul className="finance-categories-settings-modal__list">
          {sorted.map((category) => (
            <li key={category.id} className="finance-categories-settings-modal__row">
              <input
                className="finance-categories-settings-modal__input"
                defaultValue={category.name}
                disabled={pending || busyId === category.id}
                aria-label={`Rename ${category.name}`}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (!next || next === category.name) {
                    event.target.value = category.name;
                    return;
                  }
                  setBusyId(category.id);
                  setLocalError(null);
                  void Promise.resolve(onRename(category.id, next))
                    .catch((reason) => {
                      event.target.value = category.name;
                      setLocalError(
                        reason instanceof Error
                          ? reason.message
                          : "Could not rename category.",
                      );
                    })
                    .finally(() => setBusyId(null));
                }}
              />
              <span className="finance-categories-settings-modal__kind">
                {category.kind}
              </span>
              <button
                type="button"
                className="finance-categories-settings-modal__delete"
                disabled={pending || busyId === category.id}
                aria-label={`Delete ${category.name}`}
                title="Delete category"
                onClick={() => {
                  setBusyId(category.id);
                  setLocalError(null);
                  void Promise.resolve(onDelete(category.id))
                    .catch((reason) => {
                      setLocalError(
                        reason instanceof Error
                          ? reason.message
                          : "Could not delete category.",
                      );
                    })
                    .finally(() => setBusyId(null));
                }}
              >
                <TrashIcon size={14} />
              </button>
            </li>
          ))}
          {!sorted.length ? (
            <li className="finance-categories-settings-modal__empty">
              No categories yet. Add one above.
            </li>
          ) : null}
        </ul>

        {displayError ? (
          <p className="entity-delete-modal-error" role="alert">
            {displayError}
          </p>
        ) : null}

        <div className="entity-delete-modal-actions">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="entity-delete-modal-cancel"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
