"use client";

import { TrashIcon } from "@primer/octicons-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import type { BankAccountType } from "@backsteros/contracts";

import { BANK_ACCOUNT_TYPE_OPTIONS } from "../../finance/finance-nav.js";
import {
  AvatarUpload,
  type AvatarActionResult,
} from "../entity/avatar-upload.js";

export type FinanceBankAccountModalValues = {
  name: string;
  ibanOrMask: string | null;
  type: BankAccountType;
  /**
   * Logo picked during create mode. Uploaded by the caller after the account
   * exists (no id yet at create time). Always null in edit mode, where the
   * avatar is uploaded immediately via {@link FinanceBankAccountModalProps.onUploadAvatar}.
   */
  avatarFile?: File | null;
};

export type FinanceBankAccountModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: Partial<FinanceBankAccountModalValues> | null;
  pending?: boolean;
  error?: string | null;
  avatarSrc?: string | null;
  onUploadAvatar?: (file: File) => Promise<AvatarActionResult>;
  onRemoveAvatar?: () => Promise<AvatarActionResult>;
  onDelete?: () => void | Promise<void>;
  onClose: () => void;
  onSubmit: (values: FinanceBankAccountModalValues) => void | Promise<void>;
};

function isBankAccountType(value: string): value is BankAccountType {
  return BANK_ACCOUNT_TYPE_OPTIONS.some((entry) => entry.value === value);
}

export function FinanceBankAccountModal({
  open,
  mode,
  initialValues,
  pending = false,
  error = null,
  avatarSrc = null,
  onUploadAvatar,
  onRemoveAvatar,
  onDelete,
  onClose,
  onSubmit,
}: FinanceBankAccountModalProps) {
  const titleId = useId();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [ibanOrMask, setIbanOrMask] = useState(initialValues?.ibanOrMask ?? "");
  const [type, setType] = useState<BankAccountType>(
    initialValues?.type ?? "bank_account",
  );
  const [deletePending, setDeletePending] = useState(false);
  // Create mode has no account id yet, so we buffer the picked logo locally and
  // hand it back on submit for the caller to upload after creation.
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? "");
    setIbanOrMask(initialValues?.ibanOrMask ?? "");
    setType(initialValues?.type ?? "bank_account");
    setDeletePending(false);
    setPendingAvatarFile(null);
    setPendingAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [
    initialValues?.ibanOrMask,
    initialValues?.name,
    initialValues?.type,
    open,
  ]);

  useEffect(() => {
    return () => {
      setPendingAvatarPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

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

  if (!open) {
    return null;
  }

  const title = mode === "create" ? "Create bank account" : "Edit bank account";
  const confirmLabel = mode === "create" ? "Create" : "Save";
  const busy = pending || deletePending;
  const isEdit = mode === "edit";

  // When the caller doesn't wire an upload handler (create mode on the accounts
  // page), buffer the picked logo locally so the option is always available and
  // hand the file back on submit. Callers that already buffer (transactions
  // page create) keep owning the flow via their own `onUploadAvatar`.
  const usingInternalBuffer = !isEdit && !onUploadAvatar;

  const handleAvatarUpload =
    onUploadAvatar ??
    (usingInternalBuffer
      ? async (file: File): Promise<AvatarActionResult> => {
          setPendingAvatarFile(file);
          setPendingAvatarPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
          });
          return { ok: true };
        }
      : undefined);
  const handleAvatarRemove =
    onRemoveAvatar ??
    (usingInternalBuffer
      ? async (): Promise<AvatarActionResult> => {
          setPendingAvatarFile(null);
          setPendingAvatarPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          return { ok: true };
        }
      : undefined);
  const effectiveAvatarSrc = usingInternalBuffer
    ? pendingAvatarPreview
    : avatarSrc;
  const showAvatar = Boolean(handleAvatarUpload);

  return createPortal(
    <div
      className="entity-delete-modal-root"
      data-blocking-modal=""
      data-finance-bank-account-modal=""
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
            if (!trimmed || busy) return;
            void onSubmit({
              name: trimmed,
              ibanOrMask: ibanOrMask.trim() || null,
              type,
              avatarFile: usingInternalBuffer ? pendingAvatarFile : null,
            });
          }}
        >
          <div className="finance-bank-account-modal__body">
            {showAvatar ? (
              <div className="finance-bank-account-modal__avatar">
                <AvatarUpload
                  displayName={name.trim() || "Bank account"}
                  avatarSrc={effectiveAvatarSrc}
                  shape="rounded-square"
                  allowSvg
                  showHint={false}
                  showRemove={false}
                  onUpload={handleAvatarUpload!}
                  onRemove={handleAvatarRemove ?? undefined}
                />
              </div>
            ) : null}

            <label className="finance-bank-account-modal__field">
              <span className="finance-bank-account-modal__label">Name</span>
              <input
                className="finance-bank-account-modal__input"
                value={name}
                autoFocus
                disabled={busy}
                placeholder="ING Personal"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="finance-bank-account-modal__field">
              <span className="finance-bank-account-modal__label">IBAN / mask</span>
              <input
                className="finance-bank-account-modal__input"
                value={ibanOrMask}
                disabled={busy}
                placeholder="NL80INGB0008304884"
                onChange={(event) => setIbanOrMask(event.target.value)}
              />
            </label>
            <label className="finance-bank-account-modal__field">
              <span className="finance-bank-account-modal__label">Type</span>
              <select
                className="finance-bank-account-modal__input"
                value={type}
                disabled={busy}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!isBankAccountType(value)) return;
                  setType(value);
                }}
              >
                {BANK_ACCOUNT_TYPE_OPTIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            {error ? (
              <p className="entity-delete-modal-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="finance-bank-account-modal__actions">
            {mode === "edit" && onDelete ? (
              <button
                type="button"
                className="finance-bank-account-modal__delete"
                disabled={busy}
                aria-label="Delete bank account"
                title="Delete bank account"
                onClick={() => {
                  if (busy) return;
                  setDeletePending(true);
                  void Promise.resolve(onDelete())
                    .catch(() => undefined)
                    .finally(() => setDeletePending(false));
                }}
              >
                <TrashIcon size={16} />
              </button>
            ) : (
              <span />
            )}
            <div className="finance-bank-account-modal__actions-end">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="entity-delete-modal-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="finance-bank-account-modal__save"
              >
                {pending
                  ? mode === "create"
                    ? "Creating…"
                    : "Saving…"
                  : confirmLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
