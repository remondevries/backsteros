"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { FinancialTransaction } from "@backsteros/contracts";

import {
  bulkDropdownShowIcon,
  FinanceBulkBar,
  relabelDropdownNoneOption,
  sharedNullableIdSelectionValue,
  sharedSelectionValue,
  withBulkDropdownFillState,
} from "./finance-bulk-bar.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
} from "../dropdowns/dropdown-options.js";
import { useListClearSelectionShortcut } from "../../list-nav/use-list-clear-selection-shortcut.js";
import { FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME } from "./finance-transactions-filter-bar.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import {
  resolveCategory,
  resolveGoal,
  resolveOrg,
  resolveProject,
  resolveRecurring,
} from "./finance-transactions-helpers.js";

export function FinanceTransactionsBulkBarSection({
  selectionCount,
  showSelectAll,
  selectAllPending,
  onSelectAllTransactions,
  onClearSelection,
  selectedIds,
  transactions,
  onBulkPatch,
  onBulkDelete,
  orgOptions,
  projectOptions,
  goalOptions,
  recurringOptions,
  categoryOptions,
  moveAccountOptions,
  createOrganizationFromQueryLabel,
  onCreateOrganizationFromQuery,
}: {
  selectionCount: number;
  showSelectAll: boolean;
  selectAllPending: boolean;
  onSelectAllTransactions?: () => void | Promise<void>;
  onClearSelection: () => void;
  selectedIds: Set<string>;
  transactions: FinancialTransaction[];
  onBulkPatch: (patch: {
    bankAccountId?: string;
    organizationId?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    goalId?: string | null;
    recurringId?: string | null;
    displayName?: string | null;
    notes?: string | null;
  }) => void | Promise<void>;
  onBulkDelete?: () => void | Promise<void>;
  orgOptions: SearchableDropdownOption[];
  projectOptions: SearchableDropdownOption[];
  goalOptions: SearchableDropdownOption[];
  recurringOptions: SearchableDropdownOption[];
  categoryOptions: SearchableDropdownOption[];
  moveAccountOptions: SearchableDropdownOption[];
  createOrganizationFromQueryLabel?: (query: string) => string | null;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
}) {
  const selectedTransactions = useMemo(
    () => transactions.filter((tx) => selectedIds.has(tx.id)),
    [selectedIds, transactions],
  );
  const [bulkDraft, setBulkDraft] = useState<{
    bankAccountId?: string;
    organizationId?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    goalId?: string | null;
    recurringId?: string | null;
  }>({});
  const [bulkApplyPending, setBulkApplyPending] = useState(false);

  const clearBulkSelection = useCallback(() => {
    setBulkDraft({});
    onClearSelection();
  }, [onClearSelection]);

  useListClearSelectionShortcut({
    enabled: selectionCount > 0,
    onClear: clearBulkSelection,
  });

  const selectionDraftKey = useMemo(
    () => [...selectedIds].sort().join(","),
    [selectedIds],
  );

  useEffect(() => {
    setBulkDraft({});
  }, [selectionDraftKey]);

  const bulkOrgValue = useMemo(() => {
    if ("organizationId" in bulkDraft) {
      return bulkDraft.organizationId ?? DROPDOWN_NONE_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.organizationId),
      DROPDOWN_NONE_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkAccountValue = useMemo(() => {
    if ("bankAccountId" in bulkDraft && bulkDraft.bankAccountId) {
      return bulkDraft.bankAccountId;
    }
    return sharedSelectionValue(
      selectedTransactions.map((tx) => tx.bankAccountId),
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkProjectValue = useMemo(() => {
    if ("projectId" in bulkDraft) {
      return bulkDraft.projectId ?? DROPDOWN_NO_PROJECT_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.projectId),
      DROPDOWN_NO_PROJECT_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkGoalValue = useMemo(() => {
    if ("goalId" in bulkDraft) {
      return bulkDraft.goalId ?? DROPDOWN_NO_GOAL_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.goalId),
      DROPDOWN_NO_GOAL_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkRecurringValue = useMemo(() => {
    if ("recurringId" in bulkDraft) {
      return bulkDraft.recurringId ?? DROPDOWN_NO_RECURRING_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.recurringId),
      DROPDOWN_NO_RECURRING_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkCategoryValue = useMemo(() => {
    if ("categoryId" in bulkDraft) {
      return bulkDraft.categoryId ?? DROPDOWN_NONE_VALUE;
    }
    return sharedNullableIdSelectionValue(
      selectedTransactions.map((tx) => tx.categoryId),
      DROPDOWN_NONE_VALUE,
    );
  }, [bulkDraft, selectedTransactions]);
  const bulkDraftReady = Object.keys(bulkDraft).length > 0;

  const bulkOrgOptions = useMemo(
    () =>
      relabelDropdownNoneOption(orgOptions, DROPDOWN_NONE_VALUE, "Organization"),
    [orgOptions],
  );
  const bulkProjectOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        projectOptions,
        DROPDOWN_NO_PROJECT_VALUE,
        "Project",
      ),
    [projectOptions],
  );
  const bulkGoalOptions = useMemo(
    () =>
      relabelDropdownNoneOption(goalOptions, DROPDOWN_NO_GOAL_VALUE, "Goal"),
    [goalOptions],
  );
  const bulkRecurringOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        recurringOptions,
        DROPDOWN_NO_RECURRING_VALUE,
        "Recurring",
      ),
    [recurringOptions],
  );
  const bulkCategoryOptions = useMemo(
    () =>
      relabelDropdownNoneOption(
        categoryOptions,
        DROPDOWN_NONE_VALUE,
        "Category",
      ),
    [categoryOptions],
  );

  const createOrganizationForBulk = (query: string) => {
    if (!onCreateOrganizationFromQuery) return;
    void Promise.resolve(onCreateOrganizationFromQuery(query)).then(
      (created) => {
        if (!created?.id) return;
        setBulkDraft((current) => ({
          ...current,
          organizationId: created.id,
        }));
      },
    );
  };

  return selectionCount > 0 ? (
    <FinanceBulkBar
      selectionCount={selectionCount}
      showSelectAll={showSelectAll}
      selectAllPending={selectAllPending}
      onSelectAll={onSelectAllTransactions}
      onClear={clearBulkSelection}
      applyEnabled={bulkDraftReady}
      applyPending={bulkApplyPending}
      onApply={async () => {
        if (!bulkDraftReady) return;
        setBulkApplyPending(true);
        try {
          await Promise.resolve(onBulkPatch(bulkDraft));
          setBulkDraft({});
        } finally {
          setBulkApplyPending(false);
        }
      }}
      onDelete={onBulkDelete}
    >
        <SearchableDropdown
          ariaLabel="Bulk set organization"
          className="property-dropdown"
          taskPropertyDropdownId="organization"
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkOrgValue,
            DROPDOWN_NONE_VALUE,
          )}
          value={bulkOrgValue}
          options={bulkOrgOptions}
          emptySelectionLabel="Organization"
          showIcon={bulkDropdownShowIcon(
            bulkOrgValue,
            DROPDOWN_NONE_VALUE,
          )}
          searchPlaceholder="Set organization"
          panelWidth={240}
          createFromQueryLabel={createOrganizationFromQueryLabel}
          onCreateFromQuery={
            onCreateOrganizationFromQuery
              ? createOrganizationForBulk
              : undefined
          }
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              organizationId: resolveOrg(value),
            }))
          }
        />
        <SearchableDropdown
          ariaLabel="Bulk move to account"
          className="property-dropdown"
          taskPropertyDropdownId="account"
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkAccountValue,
          )}
          value={bulkAccountValue}
          options={moveAccountOptions}
          emptySelectionLabel="Account"
          showIcon={bulkDropdownShowIcon(bulkAccountValue)}
          searchPlaceholder="Move to account"
          panelWidth={240}
          onChange={(value) => {
            if (!value) return;
            setBulkDraft((current) => ({
              ...current,
              bankAccountId: value,
            }));
          }}
        />
        <SearchableDropdown
          ariaLabel="Bulk set project"
          className="property-dropdown"
          taskPropertyDropdownId="project"
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkProjectValue,
            DROPDOWN_NO_PROJECT_VALUE,
          )}
          value={bulkProjectValue}
          options={bulkProjectOptions}
          emptySelectionLabel="Project"
          showIcon={bulkDropdownShowIcon(
            bulkProjectValue,
            DROPDOWN_NO_PROJECT_VALUE,
          )}
          searchPlaceholder="Set project"
          panelWidth={240}
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              projectId: resolveProject(value),
            }))
          }
        />
        <SearchableDropdown
          ariaLabel="Bulk set goal"
          className="property-dropdown"
          taskPropertyDropdownId="goal"
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkGoalValue,
            DROPDOWN_NO_GOAL_VALUE,
          )}
          value={bulkGoalValue}
          options={bulkGoalOptions}
          emptySelectionLabel="Goal"
          showIcon={bulkDropdownShowIcon(
            bulkGoalValue,
            DROPDOWN_NO_GOAL_VALUE,
          )}
          searchPlaceholder="Set goal"
          panelWidth={240}
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              goalId: resolveGoal(value),
            }))
          }
        />
        <SearchableDropdown
          ariaLabel="Bulk set recurring"
          className="property-dropdown"
          taskPropertyDropdownId="recurring"
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkRecurringValue,
            DROPDOWN_NO_RECURRING_VALUE,
          )}
          value={bulkRecurringValue}
          options={bulkRecurringOptions}
          emptySelectionLabel="Recurring"
          showIcon={bulkDropdownShowIcon(
            bulkRecurringValue,
            DROPDOWN_NO_RECURRING_VALUE,
          )}
          searchPlaceholder="Set recurring"
          panelWidth={240}
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              recurringId: resolveRecurring(value),
            }))
          }
        />
        <SearchableDropdown
          ariaLabel="Bulk set category"
          className="property-dropdown"
          taskPropertyDropdownId="category"
          triggerClassName={withBulkDropdownFillState(
            FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
            bulkCategoryValue,
            DROPDOWN_NONE_VALUE,
          )}
          value={bulkCategoryValue}
          options={bulkCategoryOptions}
          emptySelectionLabel="Category"
          showIcon={bulkDropdownShowIcon(
            bulkCategoryValue,
            DROPDOWN_NONE_VALUE,
          )}
          searchPlaceholder="Set category"
          panelWidth={220}
          onChange={(value) =>
            setBulkDraft((current) => ({
              ...current,
              categoryId: resolveCategory(value),
            }))
          }
        />
    </FinanceBulkBar>
  ) : null;
}
