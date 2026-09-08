import { useEffect, useMemo, type ReactNode } from "react";

import { ApiProvider } from "./api-context";
import { AgentMailProvider } from "./agentmail-context";
import { DesktopAgentStatusProvider } from "./agent/agent-status-context";
import { WorkspaceEventsProvider } from "./workspace-events-provider";
import { dismissBootSplash } from "./boot-splash";
import { getDesktopPublicEnvironment } from "./env";
import { createDesktopTokenProvider } from "./local-shell-auth";
import { PowerSyncProvider } from "./powersync-context";
import { DesktopWorkspaceDataProvider } from "./workspace-data";
import { BootSplashWatchdog } from "../components/boot-splash-watchdog";

function WorkspaceProviders({
  children,
  enablePowerSync,
  getToken,
}: {
  children: ReactNode;
  enablePowerSync: boolean;
  getToken: ReturnType<typeof createDesktopTokenProvider>;
}) {
  const { apiUrl } = getDesktopPublicEnvironment();

  return (
    <ApiProvider apiUrl={apiUrl} getToken={getToken}>
      <PowerSyncProvider authenticated={enablePowerSync} apiUrl={apiUrl}>
        <DesktopWorkspaceDataProvider>
          <WorkspaceEventsProvider>
            <AgentMailProvider>
              <DesktopAgentStatusProvider>
                {children}
              </DesktopAgentStatusProvider>
            </AgentMailProvider>
          </WorkspaceEventsProvider>
        </DesktopWorkspaceDataProvider>
      </PowerSyncProvider>
    </ApiProvider>
  );
}

/**
 * Opens the product shell immediately via local-shell auth.
 * GitHub commits use Settings PAT / GITHUB_API_TOKEN.
 *
 * `enablePowerSync` defaults on; the compose overlay webview sets it false so
 * we do not open a second SQLite sync connection.
 */
export function DesktopProviders({
  children,
  enablePowerSync = true,
}: {
  children: ReactNode;
  enablePowerSync?: boolean;
}) {
  const tokenProvider = useMemo(() => createDesktopTokenProvider(), []);

  useEffect(() => {
    dismissBootSplash();
  }, []);

  return (
    <BootSplashWatchdog cleared>
      <WorkspaceProviders
        enablePowerSync={enablePowerSync}
        getToken={tokenProvider}
      >
        {children}
      </WorkspaceProviders>
    </BootSplashWatchdog>
  );
}
