"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type {
  BankAccount,
  FinancialImportBatch,
  FinancialImportResult,
} from "@backsteros/contracts";

import { FinanceCsvDropzone } from "./finance-csv-dropzone.js";
import { SearchableDropdown } from "./searchable-dropdown.js";

export type FinanceImportModalProps = {
  open: boolean;
  accounts: BankAccount[];
  defaultAccountId?: string | null;
  imports: FinancialImportBatch[];
  csvFile: File | null;
  csvUploading?: boolean;
  csvProgress?: number | null;
  lastImportResult?: FinancialImportResult | null;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onAccountChange: (accountId: string) => void;
  onCsvFileSelect: (file: File | null) => void;
  onImport: () => void | Promise<void>;
};

export function FinanceImportModal({
  open,
  accounts,
  defaultAccountId = null,
  imports,
  csvFile,
  csvUploading = false,
  csvProgress = null,
  lastImportResult = null,
  pending = false,
  error = null,
  onClose,
  onAccountChange,
  onCsvFileSelect,
  onImport,
}: FinanceImportModalProps) {
  const titleId = useId();
  const [accountId, setAccountId] = useState<string | null>(
    defaultAccountId,
  );

  useEffect(() => {
    if (!open) return;
    setAccountId(defaultAccountId);
  }, [defaultAccountId, open]);

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

  const accountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({
          value: entry.id,
          label: entry.name,
          searchTerms: `${entry.name} ${entry.ibanOrMask ?? ""} ${entry.key}`,
        })),
    [accounts],
  );

  const selectedAccount =
    accounts.find((entry) => entry.id === accountId) ?? null;
  const busy = pending || csvUploading;

  if (!open) return null;

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-finance-import-modal=""
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
        className="entity-delete-modal finance-import-modal"
      >
        <h2 id={titleId} className="entity-delete-modal-title">
          Import transactions
        </h2>
        <p className="entity-delete-modal-body">
          Choose a bank account, then upload an ING or AMEX CSV.
        </p>

        <div className="finance-import-modal__body">
          <label className="finance-import-modal__field">
            <span className="finance-import-modal__label">Bank account</span>
            <SearchableDropdown
              ariaLabel="Bank account"
              value={accountId}
              options={accountOptions}
              searchPlaceholder="Select bank account…"
              panelWidth={280}
              disabled={busy || accounts.length === 0}
              onChange={(value) => {
                setAccountId(value);
                onAccountChange(value);
              }}
            />
          </label>

          <FinanceCsvDropzone
            file={csvFile}
            uploading={csvUploading}
            uploadProgress={csvProgress}
            complete={
              Boolean(lastImportResult) &&
              !csvUploading &&
              !error &&
              (lastImportResult?.inserted ?? 0) > 0
            }
            onFileSelect={onCsvFileSelect}
          />

          {lastImportResult && !csvUploading ? (
            <p
              className={
                lastImportResult.inserted > 0
                  ? "finance-import-modal__result"
                  : "entity-delete-modal-error"
              }
              role={lastImportResult.inserted > 0 ? undefined : "alert"}
            >
              {lastImportResult.inserted > 0 ? (
                <>
                  Imported {lastImportResult.inserted} · duplicates{" "}
                  {lastImportResult.duplicates} · errors{" "}
                  {lastImportResult.errors}
                  {lastImportResult.skippedAccountMismatch
                    ? ` · skipped mismatch ${lastImportResult.skippedAccountMismatch}`
                    : ""}
                </>
              ) : lastImportResult.skippedAccountMismatch > 0 ? (
                <>
                  No transactions imported: {lastImportResult.skippedAccountMismatch}{" "}
                  CSV rows did not match this account&apos;s IBAN / mask. Update
                  the bank account IBAN to match the CSV Account column, then
                  try again.
                </>
              ) : (
                <>
                  No transactions imported
                  {lastImportResult.duplicates
                    ? ` (${lastImportResult.duplicates} duplicates)`
                    : ""}
                  {lastImportResult.errors
                    ? ` · ${lastImportResult.errors} errors`
                    : ""}
                  .
                </>
              )}
            </p>
          ) : null}

          {error ? (
            <p className="entity-delete-modal-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="finance-import-modal__history">
            <h3 className="finance-import-modal__history-title">
              Recent imports
              {selectedAccount ? ` · ${selectedAccount.name}` : ""}
            </h3>
            <ul className="finance-import-modal__history-list">
              {imports.map((batch) => (
                <li key={batch.id} className="finance-import-modal__history-row">
                  <span>{batch.originalFilename}</span>
                  <span>
                    {batch.insertedCount}/{batch.rowCount} · {batch.dialect}
                  </span>
                </li>
              ))}
              {!imports.length ? (
                <li className="finance-import-modal__history-empty">
                  No imports yet for this account.
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="entity-delete-modal-actions">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="entity-delete-modal-cancel"
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy || !accountId || !csvFile}
            className="finance-bank-account-modal__save"
            onClick={() => {
              void onImport();
            }}
          >
            {csvUploading
              ? "Importing…"
              : selectedAccount
                ? `Import into ${selectedAccount.name}`
                : "Import"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
