import type { BacksterosApiClient } from "@backsteros/api-client";
import type { BankAccount, MoneybirdFinancialAccount } from "@backsteros/contracts";
import {
  FinanceBankAccountModal,
  FinanceImportModal,
} from "@backsteros/ui";
import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

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
  const [moneybirdAccounts, setMoneybirdAccounts] = useState<
    MoneybirdFinancialAccount[]
  >([]);
  const [moneybirdAccountsLoading, setMoneybirdAccountsLoading] =
    useState(false);

  useEffect(() => {
    if (!pageAccountModal) return;
    let cancelled = false;
    setMoneybirdAccountsLoading(true);
    void client
      .requestJson<{ financialAccounts: MoneybirdFinancialAccount[] }>(
        "/api/v1/finance/moneybird/financial-accounts",
      )
      .then((body) => {
        if (cancelled) return;
        setMoneybirdAccounts(body.financialAccounts ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setMoneybirdAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setMoneybirdAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, pageAccountModal]);

  const importAccounts = accounts.filter(
    (account) => !account.moneybirdFinancialAccountId,
  );

  return (
    <>
      <FinanceImportModal
        open={importOpen}
        accounts={importAccounts}
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
                currency: pageAccountModal.account.currency,
                moneybirdFinancialAccountId:
                  pageAccountModal.account.moneybirdFinancialAccountId,
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
        moneybirdAccounts={moneybirdAccounts}
        moneybirdAccountsLoading={moneybirdAccountsLoading}
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
