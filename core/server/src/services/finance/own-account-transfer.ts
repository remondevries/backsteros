/**
 * Own-account transfer detection for ledger import / cashflow.
 *
 * Priority:
 * 1. Counterparty IBAN/account matches one of our linked accounts
 * 2. Opposite-amount mirror pair on another own account within a few days
 * 3. Payee-string heuristic (Amex thank-you / saldo / "American Express" debit)
 */

import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  bankAccounts,
  financialCategories,
  financialTransactions,
} from "../../db/schema.js";

/**
 * Payee-string fallback (Amex thank-you / saldo moves / card payment debits).
 * Prefer IBAN + mirror-pair signals when available.
 */
const OWN_ACCOUNT_TRANSFER_CREDIT_PAYEE =
  /hartelijk\s+bedankt\s+voor\s+uw\s+betaling|saldo\s+overgeboekt/i;
const OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE = /^american\s+express\b/i;

export function isOwnAccountTransferPayee(options: {
  payee?: string | null;
  amountCents?: number | null;
}): boolean {
  const payee = options.payee?.trim() ?? "";
  if (!payee) return false;
  const amount = options.amountCents ?? 0;
  if (amount > 0) return OWN_ACCOUNT_TRANSFER_CREDIT_PAYEE.test(payee);
  if (amount < 0) return OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE.test(payee);
  return false;
}

export {
  OWN_ACCOUNT_TRANSFER_CREDIT_PAYEE,
  OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE,
};

/** Inclusive calendar-day window for opposite-amount mirror pairs. */
export const OWN_ACCOUNT_TRANSFER_MIRROR_DAY_WINDOW = 3;

export type OwnAccountTransferReason =
  | "own_iban"
  | "mirror_pair"
  | "payee_heuristic";

export function normalizeAccountRef(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  return compact || null;
}

/**
 * True when the counterparty IBAN/mask matches any of our own linked accounts
 * (excluding empty masks). Short masks use suffix match like CSV account checks.
 */
export function isCounterpartyOwnAccount(
  counterparty: string | null | undefined,
  ownAccountRefs: ReadonlySet<string>,
  options?: { excludeRef?: string | null },
): boolean {
  const actual = normalizeAccountRef(counterparty);
  if (!actual || ownAccountRefs.size === 0) return false;
  const exclude = normalizeAccountRef(options?.excludeRef ?? null);
  for (const raw of ownAccountRefs) {
    if (!raw) continue;
    if (exclude && raw === exclude) continue;
    if (raw.length >= 10 && actual.length >= 10) {
      if (raw === actual) return true;
      continue;
    }
    if (raw.endsWith(actual) || actual.endsWith(raw)) return true;
  }
  return false;
}

function parseBookedOnUtc(bookedOn: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bookedOn.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

export function bookedOnWithinDays(
  left: string,
  right: string,
  dayWindow = OWN_ACCOUNT_TRANSFER_MIRROR_DAY_WINDOW,
): boolean {
  const a = parseBookedOnUtc(left);
  const b = parseBookedOnUtc(right);
  if (a == null || b == null) return false;
  const diffDays = Math.abs(a - b) / 86_400_000;
  return diffDays <= dayWindow;
}

export function isMirrorTransferPair(
  left: {
    bankAccountId: string;
    amountCents: number;
    bookedOn: string;
  },
  right: {
    bankAccountId: string;
    amountCents: number;
    bookedOn: string;
  },
  dayWindow = OWN_ACCOUNT_TRANSFER_MIRROR_DAY_WINDOW,
): boolean {
  if (left.bankAccountId === right.bankAccountId) return false;
  if (left.amountCents === 0 || right.amountCents === 0) return false;
  if (left.amountCents + right.amountCents !== 0) return false;
  return bookedOnWithinDays(left.bookedOn, right.bookedOn, dayWindow);
}

export type OwnAccountTransferCandidate = {
  bankAccountId: string;
  amountCents: number;
  bookedOn: string;
};

export function detectOwnAccountTransfer(input: {
  counterparty?: string | null;
  payee?: string | null;
  amountCents: number;
  bankAccountId: string;
  bookedOn: string;
  ownAccountRefs: ReadonlySet<string>;
  /** Normalized IBAN of the source account (excluded from counterparty match). */
  sourceAccountRef?: string | null;
  mirrorCandidates?: ReadonlyArray<OwnAccountTransferCandidate>;
  dayWindow?: number;
}): OwnAccountTransferReason | null {
  if (
    isCounterpartyOwnAccount(input.counterparty, input.ownAccountRefs, {
      excludeRef: input.sourceAccountRef ?? null,
    })
  ) {
    return "own_iban";
  }

  const dayWindow = input.dayWindow ?? OWN_ACCOUNT_TRANSFER_MIRROR_DAY_WINDOW;
  for (const candidate of input.mirrorCandidates ?? []) {
    if (
      isMirrorTransferPair(
        {
          bankAccountId: input.bankAccountId,
          amountCents: input.amountCents,
          bookedOn: input.bookedOn,
        },
        candidate,
        dayWindow,
      )
    ) {
      return "mirror_pair";
    }
  }

  if (
    isOwnAccountTransferPayee({
      payee: input.payee,
      amountCents: input.amountCents,
    })
  ) {
    return "payee_heuristic";
  }

  return null;
}

export async function loadOwnAccountRefs(
  workspaceId: string,
): Promise<{
  refs: Set<string>;
  byAccountId: Map<string, string | null>;
}> {
  const rows = await db
    .select({
      id: bankAccounts.id,
      ibanOrMask: bankAccounts.ibanOrMask,
    })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.workspaceId, workspaceId),
        isNull(bankAccounts.deletedAt),
      ),
    );
  const refs = new Set<string>();
  const byAccountId = new Map<string, string | null>();
  for (const row of rows) {
    const normalized = normalizeAccountRef(row.ibanOrMask);
    byAccountId.set(row.id, normalized);
    if (normalized) refs.add(normalized);
  }
  return { refs, byAccountId };
}

/**
 * Prefer account-named transfer children, then Creditcard payments, then
 * top-level Transfer, then any live transfer category.
 */
export async function resolveTransferCategoryId(
  workspaceId: string,
  options?: {
    bankAccountName?: string | null;
    bankAccountKey?: string | null;
  },
): Promise<string | null> {
  const rows = await db
    .select({
      id: financialCategories.id,
      name: financialCategories.name,
      parentId: financialCategories.parentId,
    })
    .from(financialCategories)
    .where(
      and(
        eq(financialCategories.workspaceId, workspaceId),
        eq(financialCategories.kind, "transfer"),
        isNull(financialCategories.deletedAt),
      ),
    );

  if (rows.length === 0) return null;

  const accountHints = [
    options?.bankAccountName?.trim().toLowerCase() ?? "",
    options?.bankAccountKey?.trim().toLowerCase() ?? "",
  ].filter(Boolean);

  if (accountHints.length > 0) {
    const byAccount = rows.find((row) => {
      const name = row.name.trim().toLowerCase();
      return accountHints.some(
        (hint) =>
          hint.includes(name) ||
          name.includes(hint) ||
          // americanexpressgold22 ↔ American Express Gold
          hint.replace(/[^a-z0-9]/g, "").includes(
            name.replace(/[^a-z0-9]/g, ""),
          ),
      );
    });
    if (byAccount) return byAccount.id;
  }

  const creditcard = rows.find(
    (row) => row.name.trim().toLowerCase() === "creditcard payments",
  );
  if (creditcard) return creditcard.id;

  const transfer = rows.find(
    (row) =>
      row.parentId == null && row.name.trim().toLowerCase() === "transfer",
  );
  if (transfer) return transfer.id;

  const topLevel = rows.find((row) => row.parentId == null);
  return topLevel?.id ?? rows[0]!.id;
}

function shiftBookedOn(bookedOn: string, dayDelta: number): string | null {
  const utc = parseBookedOnUtc(bookedOn);
  if (utc == null) return null;
  const shifted = new Date(utc + dayDelta * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function loadMirrorCandidates(
  workspaceId: string,
  input: {
    bankAccountId: string;
    amountCents: number;
    bookedOn: string;
    dayWindow?: number;
  },
): Promise<OwnAccountTransferCandidate[]> {
  if (input.amountCents === 0) return [];
  const dayWindow = input.dayWindow ?? OWN_ACCOUNT_TRANSFER_MIRROR_DAY_WINDOW;
  const from = shiftBookedOn(input.bookedOn, -dayWindow);
  const to = shiftBookedOn(input.bookedOn, dayWindow);
  if (!from || !to) return [];

  const rows = await db
    .select({
      bankAccountId: financialTransactions.bankAccountId,
      amountCents: financialTransactions.amountCents,
      bookedOn: financialTransactions.bookedOn,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        ne(financialTransactions.bankAccountId, input.bankAccountId),
        eq(financialTransactions.amountCents, -input.amountCents),
        gte(financialTransactions.bookedOn, from),
        lte(financialTransactions.bookedOn, to),
      ),
    );
  return rows;
}

/** Batch helper: also matches opposite amounts inside the pending import set. */
export function collectPendingMirrorCandidates(
  rows: ReadonlyArray<OwnAccountTransferCandidate & { id?: string }>,
  current: OwnAccountTransferCandidate & { id?: string },
): OwnAccountTransferCandidate[] {
  return rows.filter(
    (row) =>
      row !== current &&
      (current.id == null || row.id == null || row.id !== current.id) &&
      isMirrorTransferPair(current, row),
  );
}

/**
 * Categories whose name is income-typed must not be stored as kind=expense.
 * Matches "Income", "Income Personal", etc.
 */
export function isIncomeNamedCategory(name: string): boolean {
  return /^income(\b|$)/i.test(name.trim());
}

export function assertIncomeCategoryKind(
  name: string,
  kind: string | undefined,
): void {
  if (kind === undefined) return;
  if (isIncomeNamedCategory(name) && kind === "expense") {
    throw new Error("CATEGORY_INCOME_KIND_MISMATCH");
  }
}
