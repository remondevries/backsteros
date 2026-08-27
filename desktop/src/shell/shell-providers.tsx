import type { ReactNode } from "react";

import {
  ChromeHeaderProvider,
  ClientLinkProvider,
  CommandPaletteProvider,
  EntityHeaderActionsShell,
  ListKeyboardNavigationProvider,
  RegisterPageTitleProvider,
  TrackedTimerProvider,
} from "@backsteros/ui/shell";

import { InboxListSessionProvider } from "../lib/inbox/inbox-list-session-context";
import { MeetingSchedulingSettingsProvider } from "../lib/use-meeting-scheduling-settings";
import { DesktopOverlayMainNavigationListener } from "../components/desktop-overlay-main-navigation-listener";
import { ExternalOpenHrefListener } from "../components/external-open-href-listener";
import { AppShellMentionCatalog } from "./app-shell-mention-catalog";
import { AppShellTaskSideEffects } from "./app-shell-task-side-effects";
import { DesktopClientLink } from "./app-shell-links";
import { MentionNavigationProvider } from "@backsteros/ui";

type ShellOuterProvidersProps = {
  children: ReactNode;
};

export function ShellOuterProviders({ children }: ShellOuterProvidersProps) {
  return (
    <CommandPaletteProvider>
      <EntityHeaderActionsShell>
        <ChromeHeaderProvider>
          <MeetingSchedulingSettingsProvider>
            {children}
          </MeetingSchedulingSettingsProvider>
        </ChromeHeaderProvider>
      </EntityHeaderActionsShell>
    </CommandPaletteProvider>
  );
}

type ShellRuntimeProvidersProps = {
  children: ReactNode;
  pathname: string;
  composeOpen: boolean;
  sessionContextValue: React.ComponentProps<
    typeof InboxListSessionProvider
  >["value"];
  registerPageIcon: (href: string, icon: string | null) => void;
  registerPageTitle: (href: string, title: string) => void;
  updateActiveTabIcon: (icon: string | null) => void;
  updateActiveTabTitle: (title: string) => void;
  setTabsState: React.ComponentProps<
    typeof AppShellTaskSideEffects
  >["setTabsState"];
  onNavigate: (href: string) => void;
};

export function ShellRuntimeProviders({
  children,
  pathname,
  composeOpen,
  sessionContextValue,
  registerPageIcon,
  registerPageTitle,
  updateActiveTabIcon,
  updateActiveTabTitle,
  setTabsState,
  onNavigate,
}: ShellRuntimeProvidersProps) {
  return (
    <ClientLinkProvider Link={DesktopClientLink}>
      <InboxListSessionProvider value={sessionContextValue}>
        <MentionNavigationProvider pathname={pathname}>
          <AppShellMentionCatalog
            pathname={pathname}
            composeOpen={composeOpen}
          >
            <ListKeyboardNavigationProvider pathname={pathname}>
              <AppShellTaskSideEffects setTabsState={setTabsState} />
              <DesktopOverlayMainNavigationListener />
              <ExternalOpenHrefListener />
              <RegisterPageTitleProvider
                pathname={pathname}
                registerPageIcon={registerPageIcon}
                registerPageTitle={registerPageTitle}
                updateActiveTabIcon={updateActiveTabIcon}
                updateActiveTabTitle={updateActiveTabTitle}
              >
                <TrackedTimerProvider onNavigate={onNavigate}>
                  {children}
                </TrackedTimerProvider>
              </RegisterPageTitleProvider>
            </ListKeyboardNavigationProvider>
          </AppShellMentionCatalog>
        </MentionNavigationProvider>
      </InboxListSessionProvider>
    </ClientLinkProvider>
  );
}
