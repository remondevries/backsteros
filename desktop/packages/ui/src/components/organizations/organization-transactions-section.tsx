"use client";

import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
  FinancialTransaction,
} from "@backsteros/contracts";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import { useFinancePanelResize } from "../../finance/use-finance-panel-resize.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import {
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  buildOrganizationDropdownOptions,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import {
  FinanceTransactionsPanelList,
  buildCategoryDropdownOptions,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
} from "../finance/finance-categories-view.js";
import {
  FinanceTransactionDetailPanel,
  type FinanceTransactionPatch,
} from "../finance/finance-transactions-view.js";
import { getEntityIconColor, ProjectOcticon } from "../projects/project-octicon.js";

const ORG_TX_DETAIL_WIDTH_KEY =
  "backsteros-desktop.organization-transactions-detail-width";

export type OrganizationTransactionsSectionProps = {
  transactions: FinancialTransaction[];
  loading?: boolean;
  categories: FinancialCategory[];
  accounts: BankAccount[];
  accountAvatarSrcById: Record<string, string>;
  organizations: FinanceCategoryOrganization[];
  projects?: Array<{ id: string; name: string; key?: string | null }>;
  goals?: FinancialGoal[];
  recurrings?: FinancialRecurring[];
  emptyLabel?: string;
  onPatchTransaction?: (
    id: string,
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkPatchTransactions?: (
    ids: string[],
    patch: FinanceCategoryTransactionPatch,
  ) => void;
  onBulkDeleteTransactions?: (ids: string[]) => void | Promise<void>;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
};

/**
 * Organization → Transactions: list + Accounts-style resizable detail panel.
 */
export function OrganizationTransactionsSection({
  transactions,
  loading = false,
  categories,
  accounts,
  accountAvatarSrcById,
  organizations,
  projects = [],
  goals = [],
  recurrings = [],
  emptyLabel = "No transactions linked to this organization.",
  onPatchTransaction,
  onBulkPatchTransactions,
  onBulkDeleteTransactions,
  onCreateOrganizationFromQuery,
}: OrganizationTransactionsSectionProps) {
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const {
    containerRef,
    detailPaneRef,
    detailWidth,
    beginResize,
    resetWidth,
  } = useFinancePanelResize(ORG_TX_DETAIL_WIDTH_KEY);

  const selectedTx =
    transactions.find((tx) => tx.id === selectedTxId) ?? null;

  useEffect(() => {
    if (
      selectedTxId &&
      !transactions.some((tx) => tx.id === selectedTxId)
    ) {
      setSelectedTxId(null);
    }
  }, [transactions, selectedTxId]);

  useEffect(() => {
    if (!selectedTxId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest("input, textarea, [contenteditable=true]") ||
          event.target.closest("[role='listbox']"))
      ) {
        return;
      }
      event.preventDefault();
      setSelectedTxId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTxId]);

  const categoryOptions = useMemo(
    () => buildCategoryDropdownOptions(categories),
    [categories],
  );
  const orgOptions = useMemo(
    () => buildOrganizationDropdownOptions(organizations),
    [organizations],
  );
  const projectOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_PROJECT_VALUE,
        label: "No project",
        searchTerms: "no project unassigned",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: `${project.key ?? ""} ${project.name}`,
      })),
    ],
    [projects],
  );
  const goalOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_GOAL_VALUE,
        label: "No goal",
        searchTerms: "no goal unassigned",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...[...goals]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((goal) => ({
          value: goal.id,
          label: goal.name,
          searchTerms: `${goal.name} ${goal.listing}`,
          icon: (
            <ProjectOcticon
              icon={goal.icon}
              size={14}
              style={
                getEntityIconColor(goal.icon)
                  ? { color: getEntityIconColor(goal.icon)! }
                  : undefined
              }
            />
          ),
        })),
    ],
    [goals],
  );
  const recurringOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_RECURRING_VALUE,
        label: "No recurring",
        searchTerms: "no recurring unassigned none",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...[...recurrings]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((entry) => ({
          value: entry.id,
          label: entry.name,
          searchTerms: entry.name,
          icon: (
            <ProjectOcticon
              icon={entry.icon}
              size={14}
              style={
                getEntityIconColor(entry.icon)
                  ? { color: getEntityIconColor(entry.icon)! }
                  : undefined
              }
            />
          ),
        })),
    ],
    [recurrings],
  );
  const moveAccountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => {
          const avatarSrc = accountAvatarSrcById[entry.id] ?? null;
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
    [accountAvatarSrcById, accounts],
  );

  const handlePatch = (id: string, patch: FinanceTransactionPatch) => {
    onPatchTransaction?.(id, patch);
  };

  return (
    <div
      ref={containerRef}
      className={[
        "organization-transactions-section",
        "finance-transactions-view",
        "finance-tx-clean",
        selectedTx ? "has-selection" : null,
        detailWidth != null ? "is-detail-resized" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        detailWidth != null
          ? ({ "--finance-cat-detail-w": `${detailWidth}px` } as CSSProperties)
          : undefined
      }
    >
      <div className="finance-categories-view__list-pane finance-transactions-view__list-pane">
        <div className="finance-transactions finance-transactions--in-split">
          <div className="finance-transactions__scroll organization-transactions-section__scroll">
            <FinanceTransactionsPanelList
              transactions={transactions}
              loading={loading}
              categories={categories}
              accounts={accounts}
              accountAvatarSrcById={accountAvatarSrcById}
              organizations={organizations}
              goals={goals}
              recurrings={recurrings}
              emptyLabel={emptyLabel}
              sectionTitle={null}
              activeTransactionId={selectedTxId}
              onOpenTransaction={(tx) => {
                setSelectedTxId((current) =>
                  current === tx.id ? null : tx.id,
                );
              }}
              onPatchTransaction={onPatchTransaction}
              onBulkPatchTransactions={onBulkPatchTransactions}
              onBulkDeleteTransactions={onBulkDeleteTransactions}
              onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
            />
          </div>
        </div>
      </div>

      {selectedTx ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize transaction panel"
          title="Drag to resize"
          className="finance-categories-view__resize-handle"
          onPointerDown={(event) => {
            event.preventDefault();
            beginResize(event.clientX);
          }}
          onDoubleClick={resetWidth}
        />
      ) : null}

      <div
        className="finance-categories-view__detail-pane"
        ref={detailPaneRef}
      >
        <FinanceTransactionDetailPanel
          transaction={selectedTx}
          organizations={organizations}
          categoryOptions={categoryOptions}
          orgOptions={orgOptions}
          projectOptions={projectOptions}
          goalOptions={goalOptions}
          recurringOptions={recurringOptions}
          moveAccountOptions={moveAccountOptions}
          onPatchTransaction={handlePatch}
          onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
          resolveCategory={resolveDropdownNone}
          resolveOrg={resolveDropdownNone}
          resolveProject={(value) =>
            value === DROPDOWN_NO_PROJECT_VALUE ? null : value
          }
          resolveGoal={(value) =>
            value === DROPDOWN_NO_GOAL_VALUE ? null : value
          }
          resolveRecurring={(value) =>
            value === DROPDOWN_NO_RECURRING_VALUE ? null : value
          }
        />
      </div>
    </div>
  );
}
