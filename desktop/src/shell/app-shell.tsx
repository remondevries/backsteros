import type { ReactNode } from "react";

import { useDesktopAvatarSrcMap } from "../lib/avatar-src";
import { useDesktopWorkspacePeople } from "../lib/workspace-data";
import { AppShellOverlays } from "./app-shell-overlays";
import { CommandPaletteHost } from "./command-palette-host";
import { ShellChrome } from "./shell-chrome";
import { ShellOuterProviders, ShellRuntimeProviders } from "./shell-providers";
import { ShellShortcutHost } from "./shell-shortcut-host";
import { useShellSidePanelHost } from "./shell-side-panel-host";
import {
  useShellBootEffects,
  useShellChromeState,
} from "./use-shell-chrome-state";
import { useShellSidePanel } from "./use-shell-side-panel";
import { useShellTabs } from "./use-shell-tabs";

function AppShellInner({ children }: { children?: ReactNode }) {
  const tabs = useShellTabs();
  const panel = useShellSidePanel();
  const chromeState = useShellChromeState();
  const pathname = panel.pathname;
  const search = panel.panelSearch;

  const {
    composeOpen,
    setComposeOpen,
    sidePanelCollapsed,
    setSidePanelCollapsed,
    sidebarCollapsed,
    windowFullscreen,
    defaultAssigneeId,
    setDefaultAssigneeIdState,
  } = chromeState;

  useShellBootEffects({ setDefaultAssigneeIdState });

  const sidePanelHost = useShellSidePanelHost({
    composeOpen,
    sidePanelCollapsed,
    setSidePanelCollapsed,
    onNavigate: tabs.navigateTo,
  });

  const { contacts } = useDesktopWorkspacePeople();
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    composeOpen ? contacts : [],
  );

  return (
    <ShellRuntimeProviders
      pathname={pathname}
      composeOpen={composeOpen}
      sessionContextValue={sidePanelHost.sessionContextValue}
      registerPageIcon={tabs.history.registerPageIcon}
      registerPageTitle={tabs.history.registerPageTitle}
      updateActiveTabIcon={tabs.updateActiveTabIcon}
      updateActiveTabTitle={tabs.updateActiveTabTitle}
      setTabsState={tabs.setTabsState}
      onNavigate={tabs.navigateTo}
    >
      <ShellShortcutHost
        tabs={tabs}
        setComposeOpen={setComposeOpen}
        showSidePanel={panel.showSidePanel}
        panelPathname={panel.panelPathname}
        setSidePanelCollapsed={setSidePanelCollapsed}
      />
      <ShellChrome
        tabs={tabs}
        settingsPage={panel.settingsPage}
        pathname={pathname}
        sidebarActivePathname={panel.sidebarActivePathname}
        inboxSidebarIndicator={sidePanelHost.inboxSidebarIndicator}
        sidePanel={sidePanelHost.sidePanel}
        showSidePanel={panel.showSidePanel}
        financeRail={sidePanelHost.financeRail}
        sidePanelCollapsed={sidePanelCollapsed}
        sidebarCollapsed={sidebarCollapsed}
        windowFullscreen={windowFullscreen}
        onComposeOpen={() => setComposeOpen(true)}
      >
        {children}
      </ShellChrome>
      <AppShellOverlays
        composeOpen={composeOpen}
        onComposeOpenChange={setComposeOpen}
        pathname={pathname}
        search={search}
        defaultAssigneeId={defaultAssigneeId}
        contactAvatarSrc={contactAvatarSrc}
      />
    </ShellRuntimeProviders>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <ShellOuterProviders>
      <CommandPaletteHost />
      <AppShellInner>{children}</AppShellInner>
    </ShellOuterProviders>
  );
}
