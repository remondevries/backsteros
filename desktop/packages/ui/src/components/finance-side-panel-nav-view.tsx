"use client";

import type { BankAccount } from "@backsteros/contracts";
import { ArrowSwitchIcon, SyncIcon } from "@primer/octicons-react";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";

import {
  FINANCE_NAV_ITEMS,
  groupBankAccountsForFinanceNav,
  getFinanceAccountHref,
  getSelectedFinanceNavIdFromPathname,
  isFinanceAccountPath,
  type FinanceAccountGroupId,
  type FinanceNavId,
} from "../finance-nav.js";
import { bankAccountMatchesSlug } from "../entity-routes.js";
import { ContentSidePanelHeader } from "./content-side-panel-header.js";
import { EntityListAvatar } from "./entity-list-avatar.js";
import { ProjectsSidePanelIcon } from "./codebase/projects-side-panel-icon.js";
import {
  FinanceAccountsNavIcon,
  FinanceCashflowNavIcon,
  FinanceCategoriesNavIcon,
  FinanceDashboardNavIcon,
  FinanceGoalsNavIcon,
  FinanceInvestmentsNavIcon,
  FinanceInvoicesNavIcon,
  SidebarChevronIcon,
} from "./sidebar-nav-icons.js";

export type FinanceSidePanelLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}>;

export type FinanceSidePanelNavViewProps = {
  pathname: string;
  accounts: BankAccount[];
  accountAvatarSrcById?: Record<string, string>;
  Link: FinanceSidePanelLinkComponent;
  onNavigate?: () => void;
  /** When true, render as a slim rail with only an expand control. */
  collapsed?: boolean;
  /** Toggle the panel between full width and the collapsed rail. */
  onToggleCollapse?: () => void;
};

function accountSlug(account: { key?: string | null; id: string }) {
  return account.key ?? account.id;
}

export function FinanceSectionNavIcon({ id }: { id: FinanceNavId }) {
  const props = { size: 16, className: "nav-icon" } as const;
  switch (id) {
    case "dashboard":
      return <FinanceDashboardNavIcon {...props} />;
    case "transactions":
      return <ArrowSwitchIcon {...props} />;
    case "invoices":
      return <FinanceInvoicesNavIcon {...props} />;
    case "goals":
      return <FinanceGoalsNavIcon {...props} />;
    case "cashflow":
      return <FinanceCashflowNavIcon {...props} />;
    case "accounts":
      return <FinanceAccountsNavIcon {...props} />;
    case "investments":
      return <FinanceInvestmentsNavIcon {...props} />;
    case "categories":
      return <FinanceCategoriesNavIcon {...props} />;
    case "recurrings":
      return <SyncIcon {...props} />;
  }
}

export function FinanceSidePanelNavView({
  pathname,
  accounts,
  accountAvatarSrcById = {},
  Link,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: FinanceSidePanelNavViewProps) {
  const activeNavId = getSelectedFinanceNavIdFromPathname(pathname);
  const selectedAccountSlug = isFinanceAccountPath(pathname)
    ? decodeURIComponent(pathname.split("/").filter(Boolean)[1] ?? "")
    : null;

  const groups = useMemo(
    () => groupBankAccountsForFinanceNav(accounts),
    [accounts],
  );

  const [expandedGroups, setExpandedGroups] = useState<
    Record<FinanceAccountGroupId, boolean>
  >({
    credit_cards: true,
    savings: true,
    investments: true,
    bank_accounts: true,
  });

  if (collapsed) {
    return (
      <div className="app-content-side-panel app-content-side-panel--finance app-content-side-panel--rail">
        <button
          type="button"
          className="finance-side-panel__collapse-toggle finance-side-panel__collapse-toggle--rail"
          title="Show Finance navigation"
          aria-label="Show Finance navigation"
          aria-pressed={true}
          onClick={onToggleCollapse}
        >
          <ProjectsSidePanelIcon size={16} collapsed />
        </button>
      </div>
    );
  }

  return (
    <div className="app-content-side-panel app-content-side-panel--finance">
      <ContentSidePanelHeader
        title="Finance"
        actions={
          onToggleCollapse ? (
            <button
              type="button"
              className="finance-side-panel__collapse-toggle"
              title="Hide Finance navigation"
              aria-label="Hide Finance navigation"
              aria-pressed={false}
              onClick={onToggleCollapse}
            >
              <ProjectsSidePanelIcon size={16} />
            </button>
          ) : null
        }
      />
      <div className="app-content-side-panel-main">
        <div className="app-content-side-panel-body finance-side-panel">
          <nav className="finance-side-panel__nav" aria-label="Finance">
            {FINANCE_NAV_ITEMS.map((item) => {
              const active = activeNavId === item.id;
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  className={[
                    "sidebar-link",
                    "finance-side-panel__link",
                    active ? "is-active" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <span className="nav-icon-wrap" aria-hidden="true">
                    <FinanceSectionNavIcon id={item.id} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="finance-side-panel__groups" aria-label="Accounts">
            {groups.map((group) => {
              const expanded = expandedGroups[group.id];
              return (
                <section
                  key={group.id}
                  className="finance-side-panel__group"
                  data-group={group.id}
                >
                  <button
                    type="button"
                    className="finance-side-panel__group-toggle"
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedGroups((current) => ({
                        ...current,
                        [group.id]: !current[group.id],
                      }))
                    }
                  >
                    <span className="finance-side-panel__group-label">
                      {group.label}
                    </span>
                    <SidebarChevronIcon
                      className="finance-side-panel__group-chevron"
                      expanded={expanded}
                    />
                  </button>
                  {expanded ? (
                    <div className="finance-side-panel__group-items">
                      {group.accounts.length === 0 ? (
                        <p className="finance-side-panel__group-empty">
                          Nothing here yet
                        </p>
                      ) : (
                        group.accounts.map((account) => {
                          const slug = accountSlug(account);
                          const href = getFinanceAccountHref(slug);
                          const active = bankAccountMatchesSlug(
                            account,
                            selectedAccountSlug,
                          );
                          const avatarSrc =
                            accountAvatarSrcById[account.id] ?? null;
                          const initial =
                            account.name.trim().charAt(0).toUpperCase() || "?";
                          return (
                            <Link
                              key={account.id}
                              to={href}
                              title={account.name}
                              className={[
                                "sidebar-link",
                                "finance-side-panel__account-link",
                                active ? "is-active" : null,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              aria-current={active ? "page" : undefined}
                              onClick={onNavigate}
                            >
                              <span
                                className="finance-side-panel__account-avatar"
                                aria-hidden="true"
                              >
                                {avatarSrc ? (
                                  <EntityListAvatar
                                    src={avatarSrc}
                                    size={18}
                                    shape="rounded-square"
                                  />
                                ) : (
                                  <span className="finance-account-dropdown-avatar-fallback">
                                    {initial}
                                  </span>
                                )}
                              </span>
                              <span className="sidebar-link-label">
                                {account.name}
                              </span>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
