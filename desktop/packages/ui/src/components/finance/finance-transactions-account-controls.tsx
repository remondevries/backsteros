"use client";

import { PencilIcon } from "@primer/octicons-react";
import { useMemo, useState, type ReactNode } from "react";

import type { BankAccount, BankAccountType } from "@backsteros/contracts";

import type { AvatarActionResult } from "../entity/avatar-upload.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import {
  FinanceBankAccountModal,
  type FinanceBankAccountModalValues,
} from "./finance-bank-account-modal.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";

const CREATE_BANK_ACCOUNT_VALUE = "__create_bank_account__";
export const ALL_BANK_ACCOUNTS_VALUE = "__all_bank_accounts__";

export type FinanceBankAccountCreateInput = {
  name: string;
  ibanOrMask: string | null;
  type: BankAccountType;
  avatarFile?: File | null;
};

export function useFinanceTransactionsAccountControls({
  account,
  allAccountsSelected,
  accounts,
  accountAvatarSrcById,
  onSelectAccount,
  onSelectAllAccounts,
  onCreateAccount,
  onUpdateAccount,
  onUploadAccountAvatar,
  onRemoveAccountAvatar,
  onDeleteAccount,
}: {
  account: BankAccount | null;
  allAccountsSelected: boolean;
  accounts: BankAccount[];
  accountAvatarSrcById: Record<string, string>;
  onSelectAccount: (accountId: string) => void;
  onSelectAllAccounts?: () => void;
  onCreateAccount: (input: FinanceBankAccountCreateInput) => void | Promise<void>;
  onUpdateAccount?: (
    accountId: string,
    patch: {
      name?: string;
      ibanOrMask?: string | null;
      type?: BankAccountType;
    },
  ) => void | Promise<void>;
  onUploadAccountAvatar?: (
    accountId: string,
    file: File,
  ) => Promise<AvatarActionResult>;
  onRemoveAccountAvatar?: (accountId: string) => Promise<AvatarActionResult>;
  onDeleteAccount?: (accountId: string) => void | Promise<void>;
}): {
  resolveAccountAvatarSrc: (accountId: string) => string | null;
  openCreateModal: () => void;
  moveAccountOptions: SearchableDropdownOption[];
  accountSwitcher: ReactNode;
  accountModalElement: ReactNode;
} {
  const [accountModal, setAccountModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; account: BankAccount }
    | null
  >(null);
  const [accountModalPending, setAccountModalPending] = useState(false);
  const [accountModalError, setAccountModalError] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  const [avatarOverrideById, setAvatarOverrideById] = useState<
    Record<string, string | null>
  >({});

  const resolveAccountAvatarSrc = (accountId: string): string | null => {
    if (Object.prototype.hasOwnProperty.call(avatarOverrideById, accountId)) {
      return avatarOverrideById[accountId] ?? null;
    }
    return accountAvatarSrcById[accountId] ?? null;
  };

  const openCreateModal = () => {
    setAccountModalError(null);
    setPendingAvatarFile(null);
    setPendingAvatarUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAccountModal({ mode: "create" });
  };

  const openEditModal = (entry: BankAccount) => {
    if (!onUpdateAccount) return;
    setAccountModalError(null);
    setPendingAvatarFile(null);
    setPendingAvatarUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAccountModal({ mode: "edit", account: entry });
  };

  const accountOptions = useMemo(
    () => [
      ...(accounts.length > 0
        ? [
            {
              value: ALL_BANK_ACCOUNTS_VALUE,
              label: "Accounts",
              searchTerms: "all accounts every combined",
            },
          ]
        : []),
      ...[...accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const avatarSrc = resolveAccountAvatarSrc(entry.id);
          const initial =
            entry.name.trim().charAt(0).toUpperCase() || "?";
          return {
            value: entry.id,
            label: entry.name,
            searchTerms: `${entry.name} ${entry.ibanOrMask ?? ""} ${entry.key}`,
            icon: avatarSrc ? (
              <EntityListAvatar
                src={avatarSrc}
                size={18}
                shape="rounded-square"
              />
            ) : (
              <span className="finance-account-dropdown-avatar-fallback">
                {initial}
              </span>
            ),
            action: onUpdateAccount
              ? {
                  ariaLabel: `Edit ${entry.name}`,
                  icon: <PencilIcon size={10} />,
                  onSelect: () => openEditModal(entry),
                  placement: "icon" as const,
                }
              : undefined,
          };
        }),
      {
        value: CREATE_BANK_ACCOUNT_VALUE,
        label: "Create account…",
        searchTerms: "create new bank account add",
      },
    ],
    // resolveAccountAvatarSrc closes over avatar maps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountAvatarSrcById, accounts, avatarOverrideById, onUpdateAccount],
  );

  const moveAccountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const avatarSrc = resolveAccountAvatarSrc(entry.id);
          const initial = entry.name.trim().charAt(0).toUpperCase() || "?";
          return {
            value: entry.id,
            label: entry.name,
            searchTerms: `${entry.name} ${entry.ibanOrMask ?? ""} ${entry.key}`,
            icon: avatarSrc ? (
              <EntityListAvatar
                src={avatarSrc}
                size={18}
                shape="rounded-square"
              />
            ) : (
              <span className="finance-account-dropdown-avatar-fallback">
                {initial}
              </span>
            ),
          };
        }),
    // resolveAccountAvatarSrc closes over avatar maps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountAvatarSrcById, accounts, avatarOverrideById],
  );

  const handleAccountModalSubmit = async (
    values: FinanceBankAccountModalValues,
  ) => {
    if (!accountModal) return;
    setAccountModalPending(true);
    setAccountModalError(null);
    try {
      if (accountModal.mode === "edit") {
        await onUpdateAccount?.(accountModal.account.id, values);
      } else {
        await onCreateAccount({
          ...values,
          avatarFile: pendingAvatarFile,
        });
      }
      setPendingAvatarFile(null);
      setPendingAvatarUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setAccountModal(null);
    } catch (error) {
      setAccountModalError(
        error instanceof Error ? error.message : "Could not save bank account.",
      );
    } finally {
      setAccountModalPending(false);
    }
  };

  const modalAccountId =
    accountModal?.mode === "edit" ? accountModal.account.id : null;
  const modalAvatarSrc =
    accountModal?.mode === "create"
      ? pendingAvatarUrl
      : modalAccountId
        ? resolveAccountAvatarSrc(modalAccountId)
        : null;

  const accountSwitcher = (
    <div className="finance-account-switcher">
      <SearchableDropdown
        ariaLabel="Bank account"
        className="property-dropdown"
        taskPropertyDropdownId="account"
        triggerClassName="property-dropdown-trigger--compose finance-account-switcher__trigger"
        value={
          allAccountsSelected
            ? ALL_BANK_ACCOUNTS_VALUE
            : (account?.id ?? null)
        }
        options={accountOptions}
        searchPlaceholder="Switch bank account…"
        panelWidth={280}
        panelAlign="start"
        renderTrigger={({ selected, open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            className={[
              "property-dropdown-trigger",
              "property-dropdown-trigger--compose",
              "finance-account-switcher__trigger",
              open ? "is-open" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label="Bank account"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {selected?.icon ? (
              <span className="property-dropdown-trigger__icon" aria-hidden="true">
                {selected.icon}
              </span>
            ) : null}
            <span className="property-dropdown-trigger__label">
              {selected?.label ??
                (accounts.length ? "Select account" : "Bank accounts")}
            </span>
          </button>
        )}
        onChange={(value) => {
          if (value === CREATE_BANK_ACCOUNT_VALUE) {
            openCreateModal();
            return;
          }
          if (value === ALL_BANK_ACCOUNTS_VALUE) {
            onSelectAllAccounts?.();
            return;
          }
          onSelectAccount(value);
        }}
      />
    </div>
  );

  const accountModalElement = (
    <FinanceBankAccountModal
      open={accountModal != null}
      mode={accountModal?.mode ?? "create"}
      initialValues={
        accountModal?.mode === "edit"
          ? {
              name: accountModal.account.name,
              ibanOrMask: accountModal.account.ibanOrMask,
              type: accountModal.account.type,
            }
          : { name: "", ibanOrMask: null, type: "bank_account" }
      }
      pending={accountModalPending}
      error={accountModalError}
      avatarSrc={modalAvatarSrc}
      onUploadAvatar={async (file) => {
        if (accountModal?.mode === "edit") {
          if (!onUploadAccountAvatar) {
            return { ok: false, error: "Avatar upload is unavailable." };
          }
          const result = await onUploadAccountAvatar(
            accountModal.account.id,
            file,
          );
          if (result.ok) {
            const url = URL.createObjectURL(file);
            setAvatarOverrideById((current) => {
              const previous = current[accountModal.account.id];
              if (previous) URL.revokeObjectURL(previous);
              return { ...current, [accountModal.account.id]: url };
            });
          }
          return result;
        }
        setPendingAvatarFile(file);
        setPendingAvatarUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(file);
        });
        return { ok: true };
      }}
      onRemoveAvatar={async () => {
        if (accountModal?.mode === "edit") {
          if (!onRemoveAccountAvatar) {
            return { ok: false, error: "Avatar removal is unavailable." };
          }
          const result = await onRemoveAccountAvatar(accountModal.account.id);
          if (result.ok) {
            setAvatarOverrideById((current) => {
              const previous = current[accountModal.account.id];
              if (previous) URL.revokeObjectURL(previous);
              return { ...current, [accountModal.account.id]: null };
            });
          }
          return result;
        }
        setPendingAvatarFile(null);
        setPendingAvatarUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        return { ok: true };
      }}
      onDelete={
        accountModal?.mode === "edit" && onDeleteAccount
          ? async () => {
              await onDeleteAccount(accountModal.account.id);
              setAccountModal(null);
            }
          : undefined
      }
      onClose={() => {
        if (accountModalPending) return;
        setAccountModal(null);
        setAccountModalError(null);
        setPendingAvatarFile(null);
        setPendingAvatarUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
      }}
      onSubmit={handleAccountModalSubmit}
    />
  );

  return {
    resolveAccountAvatarSrc,
    openCreateModal,
    moveAccountOptions,
    accountSwitcher,
    accountModalElement,
  };
}
