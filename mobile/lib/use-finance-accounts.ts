import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchBankAccountBalances, fetchBankAccounts } from "./finance-api";
import { useEntityAvatarSrcMap } from "./use-entity-avatar-src";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useSyncedOrRest } from "./use-synced-or-rest";

export type FinanceAccountRow = {
  id: string;
  key: string | null;
  name: string;
  type: string;
  currency: string;
  color: string | null;
  ibanOrMask: string | null;
  avatarStorageKey: string | null;
};

type SyncedBankAccountRow = {
  id: string;
  key: string | null;
  name: string | null;
  type: string | null;
  currency: string | null;
  color: string | null;
  iban_or_mask: string | null;
  avatar_storage_key: string | null;
};

const BANK_ACCOUNTS_SQL = `SELECT id, key, name, type, currency, color, iban_or_mask,
   avatar_storage_key
 FROM bank_accounts
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

/** Bank accounts — PowerSync Tier B table with REST reconciliation. */
export function useFinanceAccounts() {
  const client = useMobileApiClient();
  return useSyncedOrRest<SyncedBankAccountRow, FinanceAccountRow>({
    sql: BANK_ACCOUNTS_SQL,
    mapLocal: (rows) =>
      rows.map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name?.trim() || "Untitled",
        type: row.type ?? "bank_account",
        currency: row.currency ?? "EUR",
        color: row.color,
        ibanOrMask: row.iban_or_mask,
        avatarStorageKey: row.avatar_storage_key,
      })),
    fetchRest: async () => {
      const accounts = await fetchBankAccounts(client);
      return accounts.map((account) => ({
        id: account.id,
        key: account.key,
        name: account.name.trim() || "Untitled",
        type: account.type,
        currency: account.currency,
        color: account.color,
        ibanOrMask: account.ibanOrMask,
        avatarStorageKey: account.avatarStorageKey,
      }));
    },
  });
}

/** Resolve bank-account logo URIs for list/side-nav rows. */
export function useFinanceAccountAvatarSrcMap(
  accounts: readonly FinanceAccountRow[],
) {
  const client = useMobileApiClient();
  const [restAvatarKeys, setRestAvatarKeys] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchBankAccounts(client);
        if (cancelled) return;
        const keys: Record<string, string> = {};
        for (const account of remote) {
          const key = account.avatarStorageKey?.trim();
          if (key) keys[account.id] = key;
        }
        setRestAvatarKeys(keys);
      } catch {
        // Keep prior keys / fall back to synced column only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const entities = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        // Prefer live REST keys — local PowerSync can lag behind avatar uploads.
        avatarStorageKey:
          account.avatarStorageKey?.trim() ||
          restAvatarKeys[account.id] ||
          null,
      })),
    [accounts, restAvatarKeys],
  );
  return useEntityAvatarSrcMap("bank_account", entities, client);
}

/** Running balances by account id — SQL aggregate on the server, REST only. */
export function useBankAccountBalances() {
  const client = useMobileApiClient();
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setBalances(await fetchBankAccountBalances(client));
    } catch {
      // Keep the previous snapshot on transient failures.
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { balances, loading, reload };
}
