import {
  collectPendingMirrorCandidates,
  detectOwnAccountTransfer,
  loadMirrorCandidates,
  loadOwnAccountRefs,
  resolveTransferCategoryId,
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
};

/**
 * Auto-assign a transfer-kind category when own-account detection fires.
 * Leaves existing categoryId alone. Payee heuristic is the last fallback.
 */
export async function assignTransferCategoriesOnImport(
  workspaceId: string,
  rows: TransferAnnotatableRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const { refs, byAccountId } = await loadOwnAccountRefs(workspaceId);
  const transferCategoryByAccount = new Map<string, string | null>();

  async function transferCategoryFor(
    bankAccountId: string,
  ): Promise<string | null> {
    if (transferCategoryByAccount.has(bankAccountId)) {
      return transferCategoryByAccount.get(bankAccountId) ?? null;
    }
    const account = await getBankAccountById(workspaceId, bankAccountId);
    const categoryId = await resolveTransferCategoryId(workspaceId, {
      bankAccountName: account?.name ?? null,
      bankAccountKey: account?.key ?? null,
    });
    transferCategoryByAccount.set(bankAccountId, categoryId);
    return categoryId;
  }

  const pendingShape = rows.map((row) => ({
    id: row.id,
    bankAccountId: row.bankAccountId,
    amountCents: row.amountCents,
    bookedOn: row.bookedOn,
  }));

  for (const row of rows) {
    if (row.categoryId) continue;

    const pendingMirrors = collectPendingMirrorCandidates(pendingShape, {
      id: row.id,
      bankAccountId: row.bankAccountId,
      amountCents: row.amountCents,
      bookedOn: row.bookedOn,
    });
    const dbMirrors =
      pendingMirrors.length > 0
        ? []
        : await loadMirrorCandidates(workspaceId, {
            bankAccountId: row.bankAccountId,
            amountCents: row.amountCents,
            bookedOn: row.bookedOn,
          });

    const reason = detectOwnAccountTransfer({
      counterparty: row.counterparty,
      payee: row.payee,
      amountCents: row.amountCents,
      bankAccountId: row.bankAccountId,
      bookedOn: row.bookedOn,
      ownAccountRefs: refs,
      sourceAccountRef: byAccountId.get(row.bankAccountId) ?? null,
      mirrorCandidates: [...pendingMirrors, ...dbMirrors],
    });
    if (!reason) continue;

    const categoryId = await transferCategoryFor(row.bankAccountId);
    if (categoryId) row.categoryId = categoryId;
  }
}
