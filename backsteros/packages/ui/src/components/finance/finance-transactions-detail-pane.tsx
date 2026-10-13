"use client";

import { ChevronDownIcon } from "@primer/octicons-react";
import { useCallback, useEffect, useState } from "react";

import type { FinancialTransaction } from "@backsteros/contracts";
import { isVoidFinancialSettlement } from "@backsteros/contracts";

import {
  isBlockingModalOpen,
  isEditableShortcutTarget,
} from "../../shortcuts/shortcut-guards.js";
import { useTitleRenameShortcut } from "../../shortcuts/title-rename-shortcut.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import { suggestOrganizationForPayee } from "../../finance/suggest-organization-for-payee.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "../content/content-markdown-view-layout.js";
import { DocumentMarkdownEditor } from "../documents/document-markdown-editor.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import { ResizableBottomPanel } from "../shell/resizable-bottom-panel.js";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "../dropdowns/searchable-dropdown.js";
import {
  formatAmount,
  formatAmountCents,
  formatFullTxDate,
  txDescription,
  txOriginalDescription,
} from "./finance-transactions-helpers.js";

const FINANCE_TX_LEDGER_HEIGHT_KEY =
  "backsteros-desktop.finance-transactions-ledger-height";
const FINANCE_TX_LEDGER_OPEN_KEY =
  "backsteros-desktop.finance-transactions-ledger-open";

export type FinanceTransactionPatch = {
  bankAccountId?: string;
  organizationId?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  goalId?: string | null;
  recurringId?: string | null;
  displayName?: string | null;
  notes?: string | null;
};

export type FinanceTransactionDetailPanelProps = {
  transaction: FinancialTransaction | null;
  organizations: Array<{
    id: string;
    name: string;
    key?: string | null;
    avatarSrc?: string | null;
  }>;
  categoryOptions: SearchableDropdownOption[];
  orgOptions: SearchableDropdownOption[];
  projectOptions: SearchableDropdownOption[];
  goalOptions: SearchableDropdownOption[];
  recurringOptions: SearchableDropdownOption[];
  moveAccountOptions: SearchableDropdownOption[];
  onPatchTransaction: (id: string, patch: FinanceTransactionPatch) => void;
  onCreateOrganizationFromQuery?: (
    query: string,
  ) => Promise<{ id: string }> | { id: string };
  resolveCategory: (value: string) => string | null;
  resolveOrg: (value: string) => string | null;
  resolveProject: (value: string) => string | null;
  resolveGoal: (value: string) => string | null;
  resolveRecurring: (value: string) => string | null;
};

export function FinanceTransactionDetailPanel({
  transaction,
  organizations,
  categoryOptions,
  orgOptions,
  projectOptions,
  goalOptions,
  recurringOptions,
  moveAccountOptions,
  onPatchTransaction,
  onCreateOrganizationFromQuery,
  resolveCategory,
  resolveOrg,
  resolveProject,
  resolveGoal,
  resolveRecurring,
}: FinanceTransactionDetailPanelProps) {
  const [ledgerOpen, setLedgerOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(FINANCE_TX_LEDGER_OPEN_KEY) === "1";
  });
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);

  useTitleRenameShortcut(
    useCallback(() => {
      setRenameFocusRequest((count) => count + 1);
    }, []),
    { enabled: Boolean(transaction) },
  );

  const notesInitial = transaction?.notes ?? "";
  const {
    value: notesValue,
    mode: notesMode,
    editorActivated: notesEditorActivated,
    editorFocusRequest: notesEditorFocusRequest,
    handleChange: handleNotesChange,
    handleBlurSave: handleNotesBlurSave,
    setViewMode: setNotesViewMode,
    toggleViewMode: toggleNotesViewMode,
  } = useMarkdownDetailEditor({
    initialValue: notesInitial,
    shortcutsEnabled: Boolean(transaction),
    save: (next) => {
      if (!transaction) return { ok: true };
      const trimmed = next.trim();
      onPatchTransaction(transaction.id, {
        notes: trimmed.length > 0 ? next : null,
      });
      return { ok: true };
    },
  });

  useEffect(() => {
    if (!transaction) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.repeat) return;
      const isL =
        (event.key.length === 1 && event.key.toLowerCase() === "l") ||
        event.code === "KeyL";
      if (!isL) return;
      if (isBlockingModalOpen()) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (isEditableShortcutTarget(document.activeElement)) return;
      if (document.querySelector("[data-searchable-dropdown-panel]")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setLedgerOpen((open) => {
        const next = !open;
        window.localStorage.setItem(
          FINANCE_TX_LEDGER_OPEN_KEY,
          next ? "1" : "0",
        );
        return next;
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [transaction]);

  if (!transaction) {
    return (
      <div className="finance-categories-view__detail-empty">
        Select a transaction to see its details.
      </div>
    );
  }

  const description = txDescription(transaction);
  const originalDescription = txOriginalDescription(transaction);
  const suggestion =
    transaction.organizationId == null
      ? suggestOrganizationForPayee(
          transaction.payee,
          transaction.counterparty,
          organizations,
        )
      : null;
  const rawEntries = Object.entries(transaction.raw ?? {}).filter(
    ([, value]) => value.trim().length > 0,
  );

  function toggleLedger() {
    setLedgerOpen((open) => {
      const next = !open;
      window.localStorage.setItem(
        FINANCE_TX_LEDGER_OPEN_KEY,
        next ? "1" : "0",
      );
      return next;
    });
  }

  return (
    <aside
      className="finance-categories-view__detail finance-transactions-view__detail"
      aria-label="Transaction details"
      data-content-view-mode={notesMode}
    >
      <div className="finance-transactions-view__detail-scroll">
        <div className="finance-transactions-view__detail-hero">
          <p className="finance-transactions-view__detail-date">
            {formatFullTxDate(transaction.bookedOn)}
          </p>
          <div className="finance-transactions-view__detail-hero-primary">
            <OverviewNameEditor
              value={description}
              entityLabel="Transaction"
              resetKey={transaction.id}
              titleClassName="finance-transactions-view__detail-title"
              renameFocusRequest={renameFocusRequest}
              onSave={(name) => {
                const trimmed = name.trim();
                const nextDisplayName =
                  !trimmed || trimmed === originalDescription
                    ? null
                    : trimmed;
                onPatchTransaction(transaction.id, {
                  displayName: nextDisplayName,
                });
                return { ok: true };
              }}
            />
            <span
              className={[
                "finance-transactions-view__detail-amount",
                isVoidFinancialSettlement(transaction.settlementState)
                  ? "is-void"
                  : transaction.amountCents < 0
                    ? "is-debit"
                    : "is-credit",
              ].join(" ")}
              title={
                isVoidFinancialSettlement(transaction.settlementState)
                  ? `Not counted · ${transaction.settlementState}`
                  : undefined
              }
            >
              {formatAmount(transaction.amountCents, transaction.currency)}
            </span>
          </div>
          <div className="finance-transactions-view__detail-account">
            <SearchableDropdown
              ariaLabel="Account"
              className="property-dropdown finance-transactions-view__detail-account-dropdown"
              taskPropertyDropdownId="account"
              triggerClassName="property-dropdown-trigger--inline-chip"
              value={transaction.bankAccountId}
              options={moveAccountOptions}
              searchPlaceholder="Move to account…"
              panelWidth={260}
              panelAlign="start"
              disabled={moveAccountOptions.length < 2}
              onChange={(value) => {
                if (value === transaction.bankAccountId) return;
                onPatchTransaction(transaction.id, {
                  bankAccountId: value,
                });
              }}
            />
          </div>
        </div>

        <div className="finance-tx-row__details-classify">
          <div className="finance-tx-row__details-props finance-tx-row__details-props--list">
            <PropertyFieldGroup label="Category">
              <SearchableDropdown
                ariaLabel="Category"
                className="property-dropdown"
                taskPropertyDropdownId="category"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.categoryId}
                options={categoryOptions}
                searchPlaceholder="Category"
                panelWidth={220}
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    categoryId: resolveCategory(value),
                  })
                }
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Organization">
              <SearchableDropdown
                ariaLabel="Organization"
                className="property-dropdown"
                taskPropertyDropdownId="merchant"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.organizationId}
                options={orgOptions}
                searchPlaceholder="Organization"
                panelWidth={260}
                createFromQueryLabel={
                  onCreateOrganizationFromQuery
                    ? (query) =>
                        getCreateEntityFromQueryLabel("organization", query)
                    : undefined
                }
                onCreateFromQuery={
                  onCreateOrganizationFromQuery
                    ? (query) => {
                        void Promise.resolve(
                          onCreateOrganizationFromQuery(query),
                        ).then((created) => {
                          if (!created?.id) return;
                          onPatchTransaction(transaction.id, {
                            organizationId: created.id,
                          });
                        });
                      }
                    : undefined
                }
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    organizationId: resolveOrg(value),
                  })
                }
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Project">
              <SearchableDropdown
                ariaLabel="Project"
                className="property-dropdown"
                taskPropertyDropdownId="project"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.projectId}
                options={projectOptions}
                searchPlaceholder="Project"
                panelWidth={260}
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    projectId: resolveProject(value),
                  })
                }
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Goal">
              <SearchableDropdown
                ariaLabel="Goal"
                className="property-dropdown"
                taskPropertyDropdownId="goal"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.goalId}
                options={goalOptions}
                searchPlaceholder="Goal"
                panelWidth={260}
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    goalId: resolveGoal(value),
                  })
                }
              />
            </PropertyFieldGroup>
            <PropertyFieldGroup label="Recurring">
              <SearchableDropdown
                ariaLabel="Recurring"
                className="property-dropdown"
                taskPropertyDropdownId="recurring"
                triggerClassName="property-dropdown-trigger--inline-chip"
                value={transaction.recurringId}
                options={recurringOptions}
                searchPlaceholder="Recurring"
                panelWidth={260}
                onChange={(value) =>
                  onPatchTransaction(transaction.id, {
                    recurringId: resolveRecurring(value),
                  })
                }
              />
            </PropertyFieldGroup>
          </div>
          {suggestion ? (
            <button
              type="button"
              className="finance-tx-row__suggest"
              onClick={() =>
                onPatchTransaction(transaction.id, {
                  organizationId: suggestion.id,
                })
              }
            >
              Suggest org: {suggestion.name}
            </button>
          ) : null}
        </div>

        <div className="finance-transactions-view__notes markdown-document-scrollport">
          <h3 className="finance-transactions-view__notes-heading">Notes</h3>
          <ContentMarkdownViewLayout
            mode={notesMode}
            editorActivated={notesEditorActivated}
            onToggleMode={toggleNotesViewMode}
            editor={
              <DocumentMarkdownEditor
                value={notesValue}
                onChange={handleNotesChange}
                onBlur={handleNotesBlurSave}
                focusRequest={notesEditorFocusRequest}
                ariaLabel="Transaction notes"
                scrollWithContent
              />
            }
            preview={
              <ContentMarkdownPreviewColumn includeTopInset={false}>
                {notesValue.trim() ? (
                  <DocumentMarkdownPreview
                    body={notesValue}
                    onChange={handleNotesChange}
                  />
                ) : (
                  <p className="content-markdown-empty-hint">
                    Add a note for this transaction…
                  </p>
                )}
              </ContentMarkdownPreviewColumn>
            }
          />
        </div>
      </div>

      <div className="finance-transactions-view__notes-dock">
        <FloatingPillToggleDock className="finance-transactions-view__notes-mode-toggle">
          <SegmentedPillToggle
            value={notesMode}
            options={[
              { value: "preview", label: "Preview" },
              { value: "edit", label: "Edit" },
            ]}
            onChange={(nextMode) => {
              if (nextMode === "edit") {
                setNotesViewMode("edit");
                return;
              }
              setNotesViewMode(nextMode);
            }}
            ariaLabel="Notes view mode"
          />
        </FloatingPillToggleDock>
      </div>

      <ResizableBottomPanel
        storageKey={FINANCE_TX_LEDGER_HEIGHT_KEY}
        defaultHeight={280}
        minHeight={140}
        collapsed={!ledgerOpen}
        collapsedHeight={44}
        className={[
          "finance-tx-ledger-tray",
          ledgerOpen ? null : "finance-tx-ledger-tray--collapsed",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="finance-tx-ledger-tray__chrome">
          <button
            type="button"
            className="finance-tx-ledger-tray__toggle"
            aria-expanded={ledgerOpen}
            aria-controls="finance-tx-ledger-panel"
            title={ledgerOpen ? "Hide ledger" : "Show ledger"}
            aria-label={ledgerOpen ? "Hide ledger" : "Show ledger"}
            onClick={toggleLedger}
          >
            <span className="finance-tx-ledger-tray__title">Ledger</span>
            <ChevronDownIcon
              size={14}
              className={[
                "finance-tx-ledger-tray__chevron",
                ledgerOpen ? "is-open" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </button>
        </div>
        {ledgerOpen ? (
          <div
            id="finance-tx-ledger-panel"
            className="finance-tx-ledger-tray__body"
          >
            <dl className="finance-tx-row__details-grid">
              <div>
                <dt>Date</dt>
                <dd>{transaction.bookedOn}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd
                  className={
                    isVoidFinancialSettlement(transaction.settlementState)
                      ? "finance-tx-row__amount is-void"
                      : undefined
                  }
                >
                  {formatAmount(transaction.amountCents, transaction.currency)}
                  {isVoidFinancialSettlement(transaction.settlementState)
                    ? ` · ${transaction.settlementState}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Payee</dt>
                <dd>{transaction.payee || "—"}</dd>
              </div>
              <div>
                <dt>Counterparty</dt>
                <dd>{transaction.counterparty || "—"}</dd>
              </div>
              <div>
                <dt>Memo</dt>
                <dd>{transaction.memo || "—"}</dd>
              </div>
              <div>
                <dt>Balance after</dt>
                <dd>
                  {formatAmountCents(
                    transaction.balanceAfterCents,
                    transaction.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>{transaction.sourceCode || "—"}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{transaction.sourceType || "—"}</dd>
              </div>
              <div>
                <dt>External id</dt>
                <dd>{transaction.externalId || "—"}</dd>
              </div>
            </dl>

            <div className="finance-tx-row__details-raw">
              <h4 className="finance-tx-row__details-heading">Original CSV</h4>
              {rawEntries.length ? (
                <dl className="finance-tx-row__details-grid">
                  {rawEntries.map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="finance-tx-row__details-empty">
                  No original CSV columns stored for this row.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </ResizableBottomPanel>
    </aside>
  );
}
