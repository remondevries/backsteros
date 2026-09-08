import { createElement, memo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  BreadcrumbChromeSkeleton,
  HistoryEntryIcon,
  ProductAppShell,
  ProductSidebar,
  SettingsSidePanelNavView,
  useChromeHeader,
  type ProductSidebarRecentPage,
} from "@backsteros/ui/shell";
import { resolveHistoryEntryDisplay } from "@backsteros/ui/navigation";

import { CursorCreditsUsageBar } from "../components/cursor-credits-usage-bar";
import { DesktopStatusBar } from "../components/desktop-status-bar";
import { navigateToHref } from "../router/navigate-href";
import { RouterLink } from "./app-shell-links";
import { renderAppShellTabIcon } from "./app-shell-tab-icon";
import type { useShellTabs } from "./use-shell-tabs";

type ShellChromeProps = {
  children?: ReactNode;
  tabs: ReturnType<typeof useShellTabs>;
  settingsPage: boolean;
  pathname: string;
  sidebarActivePathname: string;
  inboxSidebarIndicator: ReturnType<
    typeof import("@backsteros/ui/inbox").resolveInboxSidebarIndicatorTone
  >;
  sidePanel: ReactNode;
  showSidePanel: boolean;
  financeRail: boolean;
  sidePanelCollapsed: boolean;
  sidePanelAnimating: boolean;
  sidebarCollapsed: boolean;
  sidebarAnimating: boolean;
  windowFullscreen: boolean;
  onComposeOpen: () => void;
};

function ShellChromeInner({
  children,
  tabs,
  settingsPage,
  pathname,
  sidebarActivePathname,
  inboxSidebarIndicator,
  sidePanel,
  showSidePanel,
  financeRail,
  sidePanelCollapsed,
  sidePanelAnimating,
  sidebarCollapsed,
  sidebarAnimating,
  windowFullscreen,
  onComposeOpen,
}: ShellChromeProps) {
  const navigate = useNavigate();
  const chromeHeader = useChromeHeader();
  const { tabsState, history, activateTab, closeTab, openNewTab } = tabs;
  const showSidePanelSlot = showSidePanel && Boolean(sidePanel);

  const sidebar = settingsPage ? (
    <SettingsSidePanelNavView
      pathname={pathname}
      Link={RouterLink}
      onBack={() => navigateToHref(navigate, "/inbox")}
    />
  ) : (
    <ProductSidebar
      pathname={pathname}
      activePathname={sidebarActivePathname}
      Link={RouterLink}
      onBack={history.goBack}
      onForward={history.goForward}
      canGoBack={history.canGoBack}
      canGoForward={history.canGoForward}
      footer={<CursorCreditsUsageBar />}
      inboxIndicatorTone={inboxSidebarIndicator}
      recentPages={history.recentPages.map((page): ProductSidebarRecentPage => {
        const display = resolveHistoryEntryDisplay(page.href, page.title);
        return {
          id: page.href,
          href: page.href,
          title: display.title,
          badge: display.badgeLabel,
          icon: createElement(HistoryEntryIcon, {
            display,
            icon: page.icon,
          }),
        };
      })}
      onSelectRecentPage={(href) => history.navigateToHistoryEntry(href)}
      onCompose={onComposeOpen}
    />
  );

  return (
    <ProductAppShell
      className={windowFullscreen ? "is-window-fullscreen" : undefined}
      sidebar={sidebar}
      sidebarCollapsed={sidebarCollapsed}
      sidebarAnimating={sidebarAnimating}
      tabs={tabsState.tabs}
      activeTabId={tabsState.activeTabId}
      onActivateTab={activateTab}
      onCloseTab={closeTab}
      onOpenNewTab={openNewTab}
      historyToolbar={
        sidebarCollapsed
          ? {
              onBack: history.goBack,
              onForward: history.goForward,
              canGoBack: history.canGoBack,
              canGoForward: history.canGoForward,
              recentPages: history.recentPages.map(
                (page): ProductSidebarRecentPage => {
                  const display = resolveHistoryEntryDisplay(
                    page.href,
                    page.title,
                  );
                  return {
                    id: page.href,
                    href: page.href,
                    title: display.title,
                    badge: display.badgeLabel,
                    icon: createElement(HistoryEntryIcon, {
                      display,
                      icon: page.icon,
                    }),
                  };
                },
              ),
              onSelectRecentPage: (href) =>
                history.navigateToHistoryEntry(href),
            }
          : null
      }
      renderTabIcon={renderAppShellTabIcon}
      showSidePanel={showSidePanelSlot}
      sidePanel={sidePanel}
      sidePanelCollapsed={sidePanelCollapsed && !financeRail}
      sidePanelAnimating={sidePanelAnimating && !financeRail}
      chromeHeader={
        chromeHeader ?? (showSidePanelSlot ? <BreadcrumbChromeSkeleton /> : null)
      }
      statusBar={sidebarCollapsed ? null : <DesktopStatusBar />}
    >
      {children}
    </ProductAppShell>
  );
}

export const ShellChrome = memo(ShellChromeInner);
