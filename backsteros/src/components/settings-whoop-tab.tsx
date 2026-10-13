import { useCallback, useEffect, useState } from "react";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import {
  fetchWhoopDaySnapshot,
  fetchWhoopSettingsStatus,
  todayIsoDate,
  type WhoopSettingsStatus,
} from "../lib/whoop";

export function SettingsWhoopTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const [status, setStatus] = useState<WhoopSettingsStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchWhoopSettingsStatus();
      setStatus(next);
      return next;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not read Whoop status.";
      const fallback: WhoopSettingsStatus = {
        connected: false,
        configured: false,
        email: null,
        reason: message,
        envPath: "",
      };
      setStatus(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connected = status?.connected ?? false;

  return (
    <IntegrationConnectionSettingsView
      title={title}
      headerDescription={description}
      hideHeader={hideHeader}
      connected={status === null ? undefined : connected}
      body={
        <p>
          Recovery, sleep, and strain appear above journal entries when Whoop
          credentials are configured. Tokens are read from a local{" "}
          <code>totem.env</code> file under{" "}
          <code>~/.backsteros-agent/</code>. BacksterOS does not store Whoop
          passwords.
        </p>
      }
      statusLabel={
        status === null ? "Loading…" : connected ? "Connected" : "Not connected"
      }
      secondaryLabel="Account"
      secondaryValue={status?.email ?? "—"}
      reason={!connected ? status?.reason : null}
      hint={
        connected
          ? "Credentials are present. Use Test connection to load today\u2019s recovery, sleep, and strain snapshot."
          : status?.envPath
            ? `Looking for tokens at ${status.envPath}`
            : null
      }
      testing={testing}
      testMessage={testMessage}
      testOk={testOk}
      testDisabled={status === null}
      onTestConnection={() => {
        void (async () => {
          setTesting(true);
          setTestMessage(null);
          setTestOk(null);
          try {
            const result = await fetchWhoopDaySnapshot(todayIsoDate());
            await refresh();
            if (!result.authenticated) {
              setTestOk(false);
              setTestMessage(
                result.error ??
                  "Whoop is not connected. Add refresh or bearer tokens to totem.env.",
              );
              return;
            }
            if (result.snapshot) {
              setTestOk(true);
              setTestMessage("Connected — today\u2019s Whoop snapshot loaded.");
              return;
            }
            setTestOk(false);
            setTestMessage(
              result.error ?? "Could not load today\u2019s Whoop snapshot.",
            );
          } catch (error) {
            setTestOk(false);
            setTestMessage(
              error instanceof Error
                ? error.message
                : "Whoop connection test failed",
            );
          } finally {
            setTesting(false);
          }
        })();
      }}
    />
  );
}
