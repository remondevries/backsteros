import { createElement, memo, type ReactNode } from "react";

import {
  BreadcrumbChromeSkeleton,
  HistoryEntryIcon,
  ProductAppShell,
  ProductSidebar,
  SettingsSidePanelNavView,
  useChromeHeader,
  type ProductSidebarRecentPage,
} from "@backsteros/ui/shell";
import {
  isMeetingRoomPath,
  parseMeetingRoomMeetingId,
  resolveHistoryEntryDisplay,
  SETTINGS_SYNCING_HREF,
} from "@backsteros/ui/navigation";

import { CursorCreditsUsageBar } from "../components/cursor-credits-usage-bar";
import { DevTrafficLights } from "../components/dev-traffic-lights";
import { useWindowChromeDrag } from "../lib/window-drag";
import { RouterLink } from "./app-shell-links";
import { renderAppShellTabIcon } from "./app-shell-tab-icon";
import { ShellAgentDmBanner } from "./shell-agent-dm-banner";
import { ShellChatPanelSlot } from "./shell-chat-panel-slot";
import { ShellRoomMeetingsNav } from "./shell-room-meetings-nav";
import { useResolveRoomTabTooltip } from "./room-tab-tooltip";
import { AgentDmNotificationsProvider } from "./use-agent-dm-notifications";
import type { useShellTabs } from "./use-shell-tabs";
import type { resolveInboxSidebarIndicatorTone } from "@backsteros/ui/inbox";

type ShellChromeProps = {
  children?: ReactNode;
  tabs: ReturnType<typeof useShellTabs>;
  settingsPage: boolean;
  pathname: string;
  sidebarActivePathname: string;
  inboxSidebarIndicator: ReturnType<
    typeof resolveInboxSidebarIndicatorTone
  >;
  sidePanel: ReactNode;
  showSidePanel: boolean;
  financeRail: boolean;
  sidePanelCollapsed: boolean;
  sidePanelAnimating: boolean;
  sidebarCollapsed: boolean;
  sidebarAnimating: boolean;
  chatPanelCollapsed: boolean;
  chatPanelAnimating: boolean;
  chatPanelWidth: number;
  onChatPanelWidthChange: (width: number) => void;
  onToggleChatPanel: () => void;
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
  chatPanelCollapsed,
  chatPanelAnimating,
  chatPanelWidth,
  onChatPanelWidthChange,
  onToggleChatPanel,
  windowFullscreen,
  onComposeOpen,
}: ShellChromeProps) {
  const chromeHeader = useChromeHeader();
  const {
    tabsState,
    history,
    goHome,
    activateTab,
    closeTab,
    openNewTab,
    openHrefInNewTab,
  } = tabs;
  const showSidePanelSlot = showSidePanel && Boolean(sidePanel);
  useWindowChromeDrag();
  const resolveTabTooltip = useResolveRoomTabTooltip();

  const roomTabActive = isMeetingRoomPath(pathname);
  const roomMeetingId = roomTabActive
    ? parseMeetingRoomMeetingId(pathname)
    : null;

  const sidebar = settingsPage ? (
    <SettingsSidePanelNavView
      pathname={pathname}
      Link={RouterLink}
      onBack={goHome}
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
      footerBanner={<ShellAgentDmBanner />}
      footer={
        <CursorCreditsUsageBar
          onOpenSyncingSettings={() =>
            openHrefInNewTab(SETTINGS_SYNCING_HREF)
          }
        />
      }
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
      navReplacement={
        <ShellRoomMeetingsNav
          selectedMeetingId={roomMeetingId}
          tabs={tabsState.tabs}
          onActivateTab={activateTab}
        />
      }
      navReplacementActive={roomTabActive}
    />
  );

  return (
    // Provider stays mounted on settings (banner unmounts) so SSE/poll continue.
    <AgentDmNotificationsProvider>
      <DevTrafficLights hidden={windowFullscreen} />
      <ProductAppShell
        className={windowFullscreen ? "is-window-fullscreen" : undefined}
        sidebar={sidebar}
        sidebarCollapsed={sidebarCollapsed}
        sidebarAnimating={sidebarAnimating}
        chatPanel={
          <ShellChatPanelSlot collapsed={chatPanelCollapsed} />
        }
        chatPanelCollapsed={chatPanelCollapsed}
        chatPanelAnimating={chatPanelAnimating}
        chatPanelWidth={chatPanelWidth}
        onChatPanelWidthChange={onChatPanelWidthChange}
        tabs={tabsState.tabs}
        activeTabId={tabsState.activeTabId}
        onActivateTab={activateTab}
        onCloseTab={closeTab}
        onOpenNewTab={openNewTab}
        chatPanelToggle={{
          collapsed: chatPanelCollapsed,
          onToggle: onToggleChatPanel,
        }}
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
        resolveTabTooltip={resolveTabTooltip}
        showSidePanel={showSidePanelSlot}
        sidePanel={sidePanel}
        sidePanelCollapsed={sidePanelCollapsed && !financeRail}
        sidePanelRail={financeRail}
        sidePanelAnimating={sidePanelAnimating && !financeRail}
        chromeHeader={
          chromeHeader ??
          (showSidePanelSlot ? <BreadcrumbChromeSkeleton /> : null)
        }
      >
        {children}
      </ProductAppShell>
    </AgentDmNotificationsProvider>
  );
}

export const ShellChrome = memo(ShellChromeInner);
