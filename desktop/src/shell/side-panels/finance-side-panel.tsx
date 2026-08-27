import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  FinanceSidePanelNavView,
  getSelectedFinanceNavIdFromPathname,
  groupBankAccountsForFinanceNav,
  FINANCE_NAV_ITEMS,
  financeSidePanelAccountKeyboardId,
  resolveFinanceSidePanelHref,
  isFinanceAccountPath,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  type FinanceAccountGroupId,
  type FinanceSidePanelNavViewProps,
} from "@backsteros/ui";
import type { BankAccount } from "@backsteros/contracts";

import { useDesktopApi } from "../../lib/api-context";
import { useDesktopAvatarSrcMap } from "../../lib/avatar-src";
import { navigateToHref } from "../../router/navigate-href";

const BANK_ACCOUNTS_CHANGED_EVENT = "backsteros:bank-accounts-changed";

export function DesktopFinanceSidePanel({
  pathname,
  Link,
  collapsed,
  onToggleCollapse,
  onExpand,
}: Pick<
  FinanceSidePanelNavViewProps,
  "pathname" | "Link" | "collapsed" | "onToggleCollapse"
> & {
  onExpand?: () => void;
}) {
  const navigate = useNavigate();
  const { client } = useDesktopApi();
  const listRef = useRef<HTMLElement>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<
    Record<FinanceAccountGroupId, boolean>
  >({
    credit_cards: true,
    savings: true,
    investments: true,
    bank_accounts: true,
  });
  const pendingKeyboardExpandRef = useRef(false);
  const { activeZone, setActiveZone } = useListKeyboardNavigationZone();

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void client
        .requestJson<{ bankAccounts: BankAccount[] }>("/api/v1/bank-accounts")
        .then((body) => {
          if (!cancelled) setAccounts(body.bankAccounts);
        })
        .catch(() => {
          if (!cancelled) setAccounts([]);
        });
    };

    load();
    window.addEventListener(BANK_ACCOUNTS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(BANK_ACCOUNTS_CHANGED_EVENT, load);
    };
  }, [client, pathname]);

  const accountAvatarSrcById = useDesktopAvatarSrcMap(
    "bank_account",
    accounts);

  const groups = useMemo(
    () => groupBankAccountsForFinanceNav(accounts),
    [accounts]);

  const itemIds = useMemo(() => {
    const ids: string[] = FINANCE_NAV_ITEMS.map((item) => item.id);
    for (const group of groups) {
      if (!expandedGroups[group.id]) continue;
      for (const account of group.accounts) {
        ids.push(
          financeSidePanelAccountKeyboardId(account.key ?? account.id));
      }
    }
    return ids;
  }, [expandedGroups, groups]);

  const selectedId = useMemo(() => {
    const navId = getSelectedFinanceNavIdFromPathname(pathname);
    if (navId) return navId;
    if (!isFinanceAccountPath(pathname)) return null;
    const slug = decodeURIComponent(
      pathname.split("/").filter(Boolean)[1] ?? "");
    return slug ? financeSidePanelAccountKeyboardId(slug) : null;
  }, [pathname]);

  useEffect(() => {
    if (activeZone === LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL && collapsed) {
      pendingKeyboardExpandRef.current = true;
      onExpand?.();
    }
  }, [activeZone, collapsed, onExpand]);

  useEffect(() => {
    if (collapsed || !pendingKeyboardExpandRef.current) return;
    pendingKeyboardExpandRef.current = false;
    setActiveZone(LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL, {
      preferSidepanelForJk: true,
      activate: true,
    });
  }, [collapsed, setActiveZone]);

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId,
    onNavigate: (itemId) => {
      const href = resolveFinanceSidePanelHref(itemId);
      if (href) navigateToHref(navigate, href);
    },
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: itemIds.length > 0,
  });

  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL);

  return (
    <FinanceSidePanelNavView
      pathname={pathname}
      accounts={accounts}
      accountAvatarSrcById={accountAvatarSrcById}
      Link={Link}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      highlightedId={highlightedId}
      listRef={listRef}
      listContainerProps={listContainerProps}
      expandedGroups={expandedGroups}
      onExpandedGroupsChange={setExpandedGroups}
    />
  );
}
