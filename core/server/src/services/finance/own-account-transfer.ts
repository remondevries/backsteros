/**
 * Own-account transfer detection for ledger import / cashflow.
 *
 * Priority:
 * 1. Counterparty IBAN/account matches one of our linked accounts
 * 2. Opposite-amount mirror pair (1:1, eligible counterpart, void skipped)
 * 3. Payee-string heuristic (Amex thank-you / saldo / "American Express" debit)
 */

import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";

import { isBalanceAffectingFinancialSettlement } from "@backsteros/contracts";

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
/** JS word-boundary version — use OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE_PG in SQL. */
const OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE = /^american\s+express\b/i;
/**
 * Postgres `~*` word boundary is `\y`, not `\b` (backslash-b is backspace).
 */
const OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE_PG = "^american\\s+express\\y";

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
  OWN_ACCOUNT_TRANSFER_DEBIT_PAYEE_PG,
};

/** Inclusive calendar-day window for opposite-amount mirror pairs. */
export const OWN_ACCOUNT_TRANSFER_MIRROR_DAY_WINDOW = 3;

/**
 * Below this absolute amount, mirror pairs need IBAN/payee confirmation on at
 * least one side (avoids coincidental restaurant ↔ invoice matches).
 */
export const OWN_ACCOUNT_TRANSFER_SMALL_AMOUNT_CENTS = 10_000;

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
  id?: string;
  bankAccountId: string;
  amountCents: number;
  bookedOn: string;
  payee?: string | null;
  counterparty?: string | null;
  categoryKind?: string | null;
  categoryId?: string | null;
  settlementState?: string | null;
};

/** Side confirms the pair via own-IBAN or card-payment payee heuristic. */
export function sideConfirmsOwnAccountTransfer(
  side: {
    payee?: string | null;
    counterparty?: string | null;
    amountCents: number;
  },
  ownAccountRefs: ReadonlySet<string>,
  sourceAccountRef?: string | null,
): boolean {
  if (
    isCounterpartyOwnAccount(side.counterparty, ownAccountRefs, {
      excludeRef: sourceAccountRef ?? null,
    })
  ) {
    return true;
  }
  return isOwnAccountTransferPayee({
    payee: side.payee,
    amountCents: side.amountCents,
  });
}

/**
 * Counterpart is eligible when uncategorized, or either side confirms via
 * IBAN/payee (including when the counterpart is already transfer-kind).
 * Already-transfer counterparts without confirmation are rejected — otherwise
 * coincidental amounts (Mercedes lease ↔ internal Lemo-Design move) false-hit.
 * Void settlements never qualify.
 */
export function isEligibleMirrorCounterpart(
  current: {
    payee?: string | null;
    counterparty?: string | null;
    amountCents: number;
  },
  candidate: OwnAccountTransferCandidate,
  ownAccountRefs: ReadonlySet<string>,
  options?: {
    sourceAccountRef?: string | null;
    candidateSourceAccountRef?: string | null;
  },
): boolean {
  if (!isBalanceAffectingFinancialSettlement(candidate.settlementState)) {
    return false;
  }
  const uncategorized =
    candidate.categoryId == null ||
    candidate.categoryKind == null ||
    candidate.categoryKind === "";
  if (uncategorized) return true;

  if (
    sideConfirmsOwnAccountTransfer(
      current,
      ownAccountRefs,
      options?.sourceAccountRef,
    )
  ) {
    return true;
  }
  return sideConfirmsOwnAccountTransfer(
    {
      payee: candidate.payee,
      counterparty: candidate.counterparty,
      amountCents: candidate.amountCents,
    },
    ownAccountRefs,
    options?.candidateSourceAccountRef,
  );
}

function bookedOnDistanceDays(left: string, right: string): number {
  const a = parseBookedOnUtc(left);
  const b = parseBookedOnUtc(right);
  if (a == null || b == null) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / 86_400_000;
}

/**
 * Pick at most one counterpart: closest booked_on, then stable id.
 * Enforces amount/window, eligibility, small-amount confirmation, and 1:1
 * exclusion via `usedCandidateIds`.
 */
export function selectMirrorCounterpart(
  current: {
    id?: string;
    bankAccountId: string;
    amountCents: number;
    bookedOn: string;
    payee?: string | null;
    counterparty?: string | null;
  },
  candidates: ReadonlyArray<OwnAccountTransferCandidate>,
  ownAccountRefs: ReadonlySet<string>,
  options?: {
    sourceAccountRef?: string | null;
    accountRefById?: ReadonlyMap<string, string | null>;
    usedCandidateIds?: ReadonlySet<string>;
    dayWindow?: number;
  },
): OwnAccountTransferCandidate | null {
  const dayWindow = options?.dayWindow ?? OWN_ACCOUNT_TRANSFER_MIRROR_DAY_WINDOW;
  const used = options?.usedCandidateIds;
  const absAmount = Math.abs(current.amountCents);
  const needsConfirmation = absAmount < OWN_ACCOUNT_TRANSFER_SMALL_AMOUNT_CENTS;

  const eligible: OwnAccountTransferCandidate[] = [];
  for (const candidate of candidates) {
    if (current.id && candidate.id && current.id === candidate.id) continue;
    if (candidate.id && used?.has(candidate.id)) continue;
    if (!isMirrorTransferPair(current, candidate, dayWindow)) continue;
    if (
      !isEligibleMirrorCounterpart(current, candidate, ownAccountRefs, {
        sourceAccountRef: options?.sourceAccountRef,
        candidateSourceAccountRef:
          options?.accountRefById?.get(candidate.bankAccountId) ?? null,
      })
    ) {
      continue;
    }
    if (needsConfirmation) {
      const confirmed =
        sideConfirmsOwnAccountTransfer(
          current,
          ownAccountRefs,
          options?.sourceAccountRef,
        ) ||
        sideConfirmsOwnAccountTransfer(
          {
            payee: candidate.payee,
            counterparty: candidate.counterparty,
            amountCents: candidate.amountCents,
          },
          ownAccountRefs,
          options?.accountRefById?.get(candidate.bankAccountId) ?? null,
        );
      if (!confirmed) continue;
    }
    eligible.push(candidate);
  }

  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const da = bookedOnDistanceDays(current.bookedOn, a.bookedOn);
    const db = bookedOnDistanceDays(current.bookedOn, b.bookedOn);
    if (da !== db) return da - db;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
  return eligible[0] ?? null;
}

export function detectOwnAccountTransfer(input: {
  id?: string;
  counterparty?: string | null;
  payee?: string | null;
  amountCents: number;
  bankAccountId: string;
  bookedOn: string;
  ownAccountRefs: ReadonlySet<string>;
  /** Normalized IBAN of the source account (excluded from counterparty match). */
  sourceAccountRef?: string | null;
  accountRefById?: ReadonlyMap<string, string | null>;
  mirrorCandidates?: ReadonlyArray<OwnAccountTransferCandidate>;
  usedCandidateIds?: ReadonlySet<string>;
  dayWindow?: number;
}): OwnAccountTransferReason | null {
  if (
    isCounterpartyOwnAccount(input.counterparty, input.ownAccountRefs, {
      excludeRef: input.sourceAccountRef ?? null,
    })
  ) {
    return "own_iban";
  }

  const mirror = selectMirrorCounterpart(
    {
      id: input.id,
      bankAccountId: input.bankAccountId,
      amountCents: input.amountCents,
      bookedOn: input.bookedOn,
      payee: input.payee,
      counterparty: input.counterparty,
    },
    input.mirrorCandidates ?? [],
    input.ownAccountRefs,
    {
      sourceAccountRef: input.sourceAccountRef,
      accountRefById: input.accountRefById,
      usedCandidateIds: input.usedCandidateIds,
      dayWindow: input.dayWindow,
    },
  );
  if (mirror) return "mirror_pair";

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
  accounts: Array<{
    id: string;
    name: string;
    key: string;
    type: string;
    ibanOrMask: string | null;
  }>;
}> {
  const rows = await db
    .select({
      id: bankAccounts.id,
      name: bankAccounts.name,
      key: bankAccounts.key,
      type: bankAccounts.type,
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
  return { refs, byAccountId, accounts: rows };
}

export type TransferCategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
};

/**
 * Pure picker: prefer account-named transfer children for cards; otherwise
 * top-level Transfer (not Creditcard payments) for bank↔bank moves.
 */
export function pickTransferCategoryId(
  rows: readonly TransferCategoryRow[],
  options?: {
    bankAccountName?: string | null;
    bankAccountKey?: string | null;
    bankAccountType?: string | null;
    counterpartAccountType?: string | null;
  },
): string | null {
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
          hint.replace(/[^a-z0-9]/g, "").includes(
            name.replace(/[^a-z0-9]/g, ""),
          ),
      );
    });
    if (byAccount) return byAccount.id;
  }

  const involvesCard =
    options?.bankAccountType === "credit_card" ||
    options?.counterpartAccountType === "credit_card";

  if (involvesCard) {
    const creditcard = rows.find(
      (row) => row.name.trim().toLowerCase() === "creditcard payments",
    );
    if (creditcard) return creditcard.id;
  }

  const transfer = rows.find(
    (row) =>
      row.parentId == null && row.name.trim().toLowerCase() === "transfer",
  );
  if (transfer) return transfer.id;

  const topLevel = rows.find((row) => row.parentId == null);
  return topLevel?.id ?? rows[0]!.id;
}

/**
 * Prefer account-named transfer children for cards; otherwise top-level
 * Transfer (not Creditcard payments) for bank↔bank moves.
 */
export async function resolveTransferCategoryId(
  workspaceId: string,
  options?: {
    bankAccountName?: string | null;
    bankAccountKey?: string | null;
    bankAccountType?: string | null;
    counterpartAccountType?: string | null;
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

  return pickTransferCategoryId(rows, options);
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
      id: financialTransactions.id,
      bankAccountId: financialTransactions.bankAccountId,
      amountCents: financialTransactions.amountCents,
      bookedOn: financialTransactions.bookedOn,
      payee: financialTransactions.payee,
      counterparty: financialTransactions.counterparty,
      categoryId: financialTransactions.categoryId,
      settlementState: financialTransactions.settlementState,
      categoryKind: financialCategories.kind,
    })
    .from(financialTransactions)
    .leftJoin(
      financialCategories,
      eq(financialTransactions.categoryId, financialCategories.id),
    )
    .where(
      and(
        eq(financialTransactions.workspaceId, workspaceId),
        ne(financialTransactions.bankAccountId, input.bankAccountId),
        eq(financialTransactions.amountCents, -input.amountCents),
        gte(financialTransactions.bookedOn, from),
        lte(financialTransactions.bookedOn, to),
      ),
    );
  return rows.map((row) => ({
    id: row.id,
    bankAccountId: row.bankAccountId,
    amountCents: row.amountCents,
    bookedOn: row.bookedOn,
    payee: row.payee,
    counterparty: row.counterparty,
    categoryId: row.categoryId,
    categoryKind: row.categoryKind,
    settlementState: row.settlementState,
  }));
}

/** Batch helper: also matches opposite amounts inside the pending import set. */
export function collectPendingMirrorCandidates(
  rows: ReadonlyArray<OwnAccountTransferCandidate>,
  current: OwnAccountTransferCandidate,
): OwnAccountTransferCandidate[] {
  return rows.filter(
    (row) =>
      row !== current &&
      (current.id == null || row.id == null || row.id !== current.id) &&
      isMirrorTransferPair(current, row),
  );
}

/**
 * Income-named categories: exact "Income" or "Income …" (space after Income).
 * Does not match "Income tax" / "Income Tax …" (tax remains an expense label).
 */
export function isIncomeNamedCategory(name: string): boolean {
  const trimmed = name.trim();
  if (/^income$/i.test(trimmed)) return true;
  const match = /^income\s+(.+)$/i.exec(trimmed);
  if (!match) return false;
  const rest = match[1]!.trim();
  if (/^tax\b/i.test(rest)) return false;
  return true;
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

/** Default kind for create when omitted. */
export function defaultKindForCategoryName(
  name: string,
  parentKind?: string | null,
): string {
  if (isIncomeNamedCategory(name)) return "income";
  return parentKind ?? "expense";
}
