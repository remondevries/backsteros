import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiProvider } from "./api-context";
import { AgentMailProvider } from "./agentmail-context";
import { DesktopAgentStatusProvider } from "./agent/agent-status-context";
import { WorkspaceEventsProvider } from "./workspace-events-provider";
import {
  dismissBootSplash,
  presentBootSplashAccessDenied,
} from "./boot-splash";
import { probeDesktopOwnerAccess } from "./desktop-owner-access";
import { getDesktopPublicEnvironment } from "./env";
import { createDesktopTokenProvider } from "./local-shell-auth";
import { PowerSyncProvider } from "./powersync-context";
import { DesktopWorkspaceDataProvider } from "./workspace-data";
import { BootSplashWatchdog } from "../components/boot-splash-watchdog";
import { DesktopCloudClientNotices } from "../components/desktop-cloud-client-notices";
import { DesktopVersionMismatchNotice } from "../components/desktop-version-mismatch-notice";

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
              <DesktopVersionMismatchNotice />
              <DesktopCloudClientNotices />
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
 * Opens the product shell after the owner Access key verifies.
 * Revoked/missing keys keep the boot splash with Access denied.
 *
 * `enablePowerSync` defaults on; the compose overlay webview sets it false so
 * we do not open a second SQLite sync connection (overlays also skip the gate —
 * the HTML splash is already stripped for those windows).
 */
export function DesktopProviders({
  children,
  enablePowerSync = true,
}: {
  children: ReactNode;
  enablePowerSync?: boolean;
}) {
  const tokenProvider = useMemo(() => createDesktopTokenProvider(), []);
  const [access, setAccess] = useState<"pending" | "ok" | "denied">(() =>
    enablePowerSync ? "pending" : "ok",
  );

  useEffect(() => {
    if (!enablePowerSync) {
      dismissBootSplash();
      setAccess("ok");
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await probeDesktopOwnerAccess({ getToken: tokenProvider });
      if (cancelled) return;
      if (result === "denied") {
        presentBootSplashAccessDenied();
        setAccess("denied");
        return;
      }
      dismissBootSplash();
      setAccess("ok");
    })();

    return () => {
      cancelled = true;
    };
  }, [enablePowerSync, tokenProvider]);

  if (access === "pending" || access === "denied") {
    return null;
  }

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
