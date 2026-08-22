import type { BacksterosApiClient } from "@backsteros/api-client";
import type { BankAccount } from "@backsteros/contracts";
import {
  FinanceBankAccountModal,
  FinanceImportModal,
} from "@backsteros/ui";
import type { Dispatch, SetStateAction } from "react";

import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
} from "../../lib/avatar-upload";
import { notifyBankAccountsChanged } from "./finance-page-helpers";
import type { useFinanceCoreData } from "./use-finance-core-data";
import type { useFinanceTransactions } from "./use-finance-transactions";

type FinanceCoreData = ReturnType<typeof useFinanceCoreData>;
type FinanceTransactionsData = ReturnType<typeof useFinanceTransactions>;

export type FinancePageAccountModalState =
  | { mode: "create"; type?: BankAccount["type"] }
  | { mode: "edit"; account: BankAccount };

export function FinancePageModals({
  client,
  accounts,
  selected,
  accountAvatarSrcById,
  refreshAccounts,
  handleCreateAccount,
  handleUpdateAccount,
  handleDeleteAccount,
  importOpen,
  setImportOpen,
  importAccountId,
  setImportAccountId,
  imports,
  csvFile,
  setCsvFile,
  csvUploading,
  csvProgress,
  setCsvProgress,
  lastImportResult,
  setLastImportResult,
  importError,
  setImportError,
  handleImportCsv,
  pageAccountModal,
  setPageAccountModal,
  pageAccountModalPending,
  setPageAccountModalPending,
  pageAccountModalError,
  setPageAccountModalError,
}: Pick<
  FinanceCoreData,
  | "accounts"
  | "selected"
  | "accountAvatarSrcById"
  | "refreshAccounts"
  | "handleCreateAccount"
  | "handleUpdateAccount"
  | "handleDeleteAccount"
> &
  Pick<
    FinanceTransactionsData,
    | "importOpen"
    | "setImportOpen"
    | "importAccountId"
    | "setImportAccountId"
    | "imports"
    | "csvFile"
    | "setCsvFile"
    | "csvUploading"
    | "csvProgress"
    | "setCsvProgress"
    | "lastImportResult"
    | "setLastImportResult"
    | "importError"
    | "setImportError"
    | "handleImportCsv"
  > & {
    client: BacksterosApiClient;
    pageAccountModal: FinancePageAccountModalState | null;
    setPageAccountModal: Dispatch<
      SetStateAction<FinancePageAccountModalState | null>
    >;
    pageAccountModalPending: boolean;
    setPageAccountModalPending: Dispatch<SetStateAction<boolean>>;
    pageAccountModalError: string | null;
    setPageAccountModalError: Dispatch<SetStateAction<string | null>>;
  }) {
  return (
    <>
      <FinanceImportModal
        open={importOpen}
        accounts={accounts}
        defaultAccountId={importAccountId ?? selected?.id ?? null}
        imports={imports}
        csvFile={csvFile}
        csvUploading={csvUploading}
        csvProgress={csvProgress}
        lastImportResult={lastImportResult}
        error={importError}
        onClose={() => {
          if (csvUploading) return;
          setImportOpen(false);
          setImportError(null);
          setLastImportResult(null);
          setCsvFile(null);
          setCsvProgress(null);
        }}
        onAccountChange={(accountId) => {
          setImportAccountId(accountId);
          setLastImportResult(null);
          setImportError(null);
        }}
        onCsvFileSelect={(file) => {
          setCsvFile(file);
          setLastImportResult(null);
          setImportError(null);
        }}
        onImport={() => {
          void handleImportCsv();
        }}
      />

      <FinanceBankAccountModal
        open={pageAccountModal != null}
        mode={pageAccountModal?.mode ?? "create"}
        initialValues={
          pageAccountModal?.mode === "edit"
            ? {
                name: pageAccountModal.account.name,
                ibanOrMask: pageAccountModal.account.ibanOrMask,
                type: pageAccountModal.account.type,
              }
            : {
                name: "",
                ibanOrMask: null,
                type:
                  pageAccountModal?.mode === "create"
                    ? (pageAccountModal.type ?? "bank_account")
                    : "bank_account",
              }
        }
        pending={pageAccountModalPending}
        error={pageAccountModalError}
        avatarSrc={
          pageAccountModal?.mode === "edit"
            ? (accountAvatarSrcById[pageAccountModal.account.id] ?? null)
            : null
        }
        onUploadAvatar={
          pageAccountModal?.mode === "edit"
            ? async (file) => {
                const result = await uploadDesktopAvatar(
                  client,
                  "bank_account",
                  pageAccountModal.account.id,
                  file,
                );
                if (result.ok) {
                  await refreshAccounts().catch(() => undefined);
                  notifyBankAccountsChanged();
                }
                return result;
              }
            : undefined
        }
        onRemoveAvatar={
          pageAccountModal?.mode === "edit"
            ? async () => {
                const result = await removeDesktopAvatar(
                  client,
                  "bank_account",
                  pageAccountModal.account.id,
                );
                if (result.ok) {
                  await refreshAccounts().catch(() => undefined);
                  notifyBankAccountsChanged();
                }
                return result;
              }
            : undefined
        }
        onClose={() => {
          if (pageAccountModalPending) return;
          setPageAccountModal(null);
          setPageAccountModalError(null);
        }}
        onSubmit={async (values) => {
          if (!pageAccountModal) return;
          setPageAccountModalPending(true);
          setPageAccountModalError(null);
          try {
            if (pageAccountModal.mode === "edit") {
              await handleUpdateAccount(pageAccountModal.account.id, values);
            } else {
              await handleCreateAccount(values);
            }
            setPageAccountModal(null);
          } catch (reason) {
            setPageAccountModalError(
              reason instanceof Error
                ? reason.message
                : "Could not save bank account.",
            );
          } finally {
            setPageAccountModalPending(false);
          }
        }}
        onDelete={
          pageAccountModal?.mode === "edit"
            ? async () => {
                await handleDeleteAccount(pageAccountModal.account.id);
                setPageAccountModal(null);
              }
            : undefined
        }
      />
    </>
  );
}
