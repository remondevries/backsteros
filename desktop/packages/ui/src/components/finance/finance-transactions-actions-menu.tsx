"use client";

import type { FinancialTransaction } from "@backsteros/contracts";

import {
  EntityActionsMenu,
  type EntityActionsMenuItem,
} from "../entity-actions/entity-actions-menu.js";
import { useEntityHeaderActionsContext } from "../entity-actions/entity-header-actions-context.js";

/** Drives the transactions breadcrumb path + detail collapse control. */
export type FinanceTransactionsChromeState = {
  hasSelection: boolean;
  transaction: FinancialTransaction;
  /** When true, the right detail panel is collapsed (list stays visible). */
  detailCollapsed: boolean;
  detailResized: boolean;
  onToggleDetail: () => void;
  onDelete: () => void | Promise<void>;
};

/**
 * Three-dot overflow for the selected transaction — delete with the shared
 * confirmation modal (same pattern as account / category chrome).
 */
export function TransactionActionsMenu({
  transaction,
  onDelete,
  disabled = false,
}: {
  transaction: FinancialTransaction;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { openDeleteModal, isDeletePending } = useEntityHeaderActionsContext();
  const label =
    transaction.displayName?.trim() ||
    transaction.payee.trim() ||
    transaction.memo?.trim() ||
    transaction.counterparty?.trim() ||
    "Untitled transaction";

  const items: EntityActionsMenuItem[] = [
    {
      id: "delete",
      label: "Delete transaction",
      danger: true,
      disabled: isDeletePending,
      onSelect: () => {
        openDeleteModal({
          entityLabel: label,
          confirmLabel: "Delete transaction",
          onDelete: async () => {
            try {
              await Promise.resolve(onDelete());
              return { ok: true };
            } catch (reason) {
              return {
                ok: false,
                error:
                  reason instanceof Error
                    ? reason.message
                    : "Could not delete transaction.",
              };
            }
          },
        });
      },
    },
  ];

  return (
    <EntityActionsMenu
      ariaLabel={`Actions for ${label}`}
      triggerAriaLabel="Transaction actions"
      disabled={disabled || isDeletePending}
      items={items}
    />
  );
}
