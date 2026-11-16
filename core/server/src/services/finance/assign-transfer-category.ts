import {
  collectPendingMirrorCandidates,
  detectOwnAccountTransfer,
  loadMirrorCandidates,
  loadOwnAccountRefs,
  resolveTransferCategoryId,
  selectMirrorCounterpart,
  type OwnAccountTransferCandidate,
} from "./own-account-transfer.js";
import { getBankAccountById } from "./finance/catalog.js";

export type TransferAnnotatableRow = {
  id: string;
  bankAccountId: string;
  bookedOn: string;
  amountCents: number;
  payee?: string;
  counterparty?: string | null;
  categoryId?: string | null;
  categoryKind?: string | null;
  settlementState?: string | null;
};

export type AssignTransferCategoriesResult = {
  /** Pending row ids that received a transfer category. */
  assignedIds: string[];
  /** Existing DB counterpart ids that should be patched to transfer. */
  counterpartIdsToRecategorize: string[];
  transferCategoryIdByRowId: Map<string, string>;
};

/**
 * Auto-assign a transfer-kind category when own-account detection fires.
 * Leaves existing categoryId alone on pending rows. Payee heuristic is last.
 * When a DB mirror is found, also queue the counterpart for recategorization
 * if it is still uncategorized (A3).
 */
export async function assignTransferCategoriesOnImport(
  workspaceId: string,
  rows: TransferAnnotatableRow[],
): Promise<AssignTransferCategoriesResult> {
  const assignedIds: string[] = [];
  const counterpartIdsToRecategorize: string[] = [];
  const transferCategoryIdByRowId = new Map<string, string>();

  if (rows.length === 0) {
    return { assignedIds, counterpartIdsToRecategorize, transferCategoryIdByRowId };
  }

  const { refs, byAccountId, accounts } = await loadOwnAccountRefs(workspaceId);
  const accountTypeById = new Map(accounts.map((a) => [a.id, a.type]));
  const transferCategoryCache = new Map<string, string | null>();
  const usedMirrorIds = new Set<string>();

  async function transferCategoryFor(
    bankAccountId: string,
    counterpartAccountId?: string | null,
  ): Promise<string | null> {
    const cacheKey = `${bankAccountId}:${counterpartAccountId ?? ""}`;
    if (transferCategoryCache.has(cacheKey)) {
      return transferCategoryCache.get(cacheKey) ?? null;
    }
    const account = await getBankAccountById(workspaceId, bankAccountId);
    const counterpartType = counterpartAccountId
      ? accountTypeById.get(counterpartAccountId) ?? null
      : null;
    const categoryId = await resolveTransferCategoryId(workspaceId, {
      bankAccountName: account?.name ?? null,
      bankAccountKey: account?.key ?? null,
      bankAccountType: account?.type ?? null,
      counterpartAccountType: counterpartType,
    });
    transferCategoryCache.set(cacheKey, categoryId);
    return categoryId;
  }

  const pendingShape: OwnAccountTransferCandidate[] = rows.map((row) => ({
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

  for (const row of rows) {
    if (row.categoryId) continue;

    const pendingMirrors = collectPendingMirrorCandidates(pendingShape, {
      id: row.id,
      bankAccountId: row.bankAccountId,
      amountCents: row.amountCents,
      bookedOn: row.bookedOn,
      payee: row.payee,
      counterparty: row.counterparty,
      categoryId: row.categoryId,
      categoryKind: row.categoryKind,
      settlementState: row.settlementState,
    });
    const dbMirrors =
      pendingMirrors.length > 0
        ? []
        : await loadMirrorCandidates(workspaceId, {
            bankAccountId: row.bankAccountId,
            amountCents: row.amountCents,
            bookedOn: row.bookedOn,
          });

    const candidates = [...pendingMirrors, ...dbMirrors];
    const mirror = selectMirrorCounterpart(
      {
        id: row.id,
        bankAccountId: row.bankAccountId,
        amountCents: row.amountCents,
        bookedOn: row.bookedOn,
        payee: row.payee,
        counterparty: row.counterparty,
      },
      candidates,
      refs,
      {
        sourceAccountRef: byAccountId.get(row.bankAccountId) ?? null,
        accountRefById: byAccountId,
        usedCandidateIds: usedMirrorIds,
      },
    );

    const reason = detectOwnAccountTransfer({
      id: row.id,
      counterparty: row.counterparty,
      payee: row.payee,
      amountCents: row.amountCents,
      bankAccountId: row.bankAccountId,
      bookedOn: row.bookedOn,
      ownAccountRefs: refs,
      sourceAccountRef: byAccountId.get(row.bankAccountId) ?? null,
      accountRefById: byAccountId,
      mirrorCandidates: candidates,
      usedCandidateIds: usedMirrorIds,
    });
    if (!reason) continue;

    const counterpartAccountId =
      reason === "mirror_pair" ? mirror?.bankAccountId ?? null : null;
    const categoryId = await transferCategoryFor(
      row.bankAccountId,
      counterpartAccountId,
    );
    if (!categoryId) continue;

    row.categoryId = categoryId;
    assignedIds.push(row.id);
    transferCategoryIdByRowId.set(row.id, categoryId);

    if (reason === "mirror_pair" && mirror?.id) {
      usedMirrorIds.add(mirror.id);
      const isPending = rows.some((r) => r.id === mirror.id);
      if (!isPending && mirror.categoryId == null) {
        counterpartIdsToRecategorize.push(mirror.id);
        transferCategoryIdByRowId.set(mirror.id, categoryId);
      }
    }
  }

  return { assignedIds, counterpartIdsToRecategorize, transferCategoryIdByRowId };
}
