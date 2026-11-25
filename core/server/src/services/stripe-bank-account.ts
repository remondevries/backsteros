/**
 * Ensure the Finance bank account used for Stripe Balance Transactions.
 * Stable key `stripe` / display name "Stripe".
 */

import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { bankAccounts } from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import * as financeService from "./finance/finance.js";
import {
  buildBankAccountRestPayload,
  commitRestEntityWrite,
  isRestLeaderFirstWrite,
} from "./rest-leader-write.js";
import { recordBankAccountRestSyncEvent } from "./sync.js";

export const STRIPE_BANK_ACCOUNT_KEY = "stripe";
export const STRIPE_BANK_ACCOUNT_NAME = "Stripe";

export type StripeBankAccount = {
  id: string;
  key: string;
  name: string;
  created: boolean;
};

async function findByKey(workspaceId: string) {
  const [row] = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.workspaceId, workspaceId),
        eq(bankAccounts.key, STRIPE_BANK_ACCOUNT_KEY),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Idempotent: returns the existing row or creates "Stripe". */
export async function ensureStripeBankAccount(
  workspaceId: string,
): Promise<StripeBankAccount> {
  const existing = await findByKey(workspaceId);
  if (existing) {
    return {
      id: existing.id,
      key: existing.key,
      name: existing.name,
      created: false,
    };
  }

  const input = {
    key: STRIPE_BANK_ACCOUNT_KEY,
    name: STRIPE_BANK_ACCOUNT_NAME,
    currency: "EUR",
    type: "bank_account" as const,
  };

  if (isRestLeaderFirstWrite()) {
    const accountId = newId();
    await commitRestEntityWrite({
      workspaceId,
      entity: "bank_account",
      entityId: accountId,
      operation: "upsert",
      payload: buildBankAccountRestPayload(accountId, input),
    });
    const row = await financeService.getBankAccountById(workspaceId, accountId);
    if (!row) {
      throw new Error("Failed to ensure Stripe bank account");
    }
    return { id: row.id, key: row.key, name: row.name, created: true };
  }

  const row = await financeService.createBankAccount(workspaceId, input);
  await recordBankAccountRestSyncEvent(workspaceId, row, "upsert");
  return { id: row.id, key: row.key, name: row.name, created: true };
}
