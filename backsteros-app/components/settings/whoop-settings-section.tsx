"use client";

import { useEffect, useState } from "react";

import { SettingsContentHeader } from "@/components/settings/settings-content-header";
import { fetchWhoopSettingsStatus } from "@/lib/settings/whoop-status-client";
import type { WhoopSettingsStatus } from "@/lib/settings/whoop-status";

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type WhoopSettingsSectionProps = {
  title: string;
  description: string;
};

export function WhoopSettingsSection({
  title,
  description,
}: WhoopSettingsSectionProps) {
  const [status, setStatus] = useState<WhoopSettingsStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  async function refreshStatus() {
    const next = await fetchWhoopSettingsStatus();
    if (next) {
      setStatus(next);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function handleTestConnection() {
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);

    try {
      const date = todayIsoDate();
      const response = await fetch(
        `/api/whoop/day?date=${encodeURIComponent(date)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as {
        authenticated?: boolean;
        snapshot?: unknown;
        error?: string;
      } | null;

      await refreshStatus();

      if (!payload) {
        setTestOk(false);
        setTestMessage(`Could not reach Whoop API (${response.status}).`);
        return;
      }

      if (!payload.authenticated) {
        setTestOk(false);
        setTestMessage(
          payload.error ??
            "Whoop is not connected. Add refresh or bearer tokens to totem.env.",
        );
        return;
      }

      if (payload.snapshot) {
        setTestOk(true);
        setTestMessage("Connected — today's Whoop snapshot loaded.");
        return;
      }

      setTestOk(false);
      setTestMessage(
        payload.error ?? "Could not load today's Whoop snapshot.",
      );
    } catch (error) {
      setTestOk(false);
      setTestMessage(
        error instanceof Error ? error.message : "Whoop connection test failed",
      );
    } finally {
      setTesting(false);
    }
  }

  const connected = status?.connected ?? false;

  return (
    <>
      <SettingsContentHeader
        title={title}
        description={description}
        connected={status === null ? undefined : connected}
      />

      <section className="settings-card">
        <h2>Connection</h2>
        <p>
          Recovery, sleep, and strain appear above journal entries when Whoop
          credentials are configured. Tokens are read from a local{" "}
          <code>totem.env</code> file (shared with Circle). BacksterOS does not
          store Whoop passwords.
        </p>

        <dl className="settings-sync-status">
          <div>
            <dt>Status</dt>
            <dd>
              {status === null
                ? "Loading…"
                : connected
                  ? "Connected"
                  : "Not connected"}
            </dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>{status?.email ?? "—"}</dd>
          </div>
        </dl>

        {status && !connected && status.reason ? (
          <p className="settings-hint">{status.reason}</p>
        ) : null}

        {status?.connected ? (
          <p className="settings-hint">
            Credentials are present. Use Test connection to load today&apos;s
            recovery, sleep, and strain snapshot.
          </p>
        ) : null}

        <div className="settings-integration-actions">
          <button
            type="button"
            disabled={testing || status === null}
            onClick={() => void handleTestConnection()}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>

        {testMessage ? (
          <p
            className={[
              "settings-integration-test-result",
              testOk === true
                ? "settings-integration-test-result--ok"
                : testOk === false
                  ? "settings-integration-test-result--error"
                  : null,
            ]
              .filter(Boolean)
              .join(" ")}
            role="status"
          >
            {testMessage}
          </p>
        ) : null}
      </section>
    </>
  );
}
