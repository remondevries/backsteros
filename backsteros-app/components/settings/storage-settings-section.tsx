"use client";

import { useEffect, useState } from "react";

import { SettingsContentHeader } from "@/components/settings/settings-content-header";

type StorageStatus = {
  configured: boolean;
  reason?: string | null;
};

type StorageSettingsSectionProps = {
  title: string;
  description: string;
};

export function StorageSettingsSection({
  title,
  description,
}: StorageSettingsSectionProps) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  async function refreshStatus(): Promise<StorageStatus | null> {
    try {
      const response = await fetch("/api/settings/storage/status", {
        cache: "no-store",
      });
      const next = (await response.json()) as StorageStatus;
      setStatus(next);
      return next;
    } catch {
      setStatus({
        configured: false,
        reason: "Could not reach the app to check storage.",
      });
      return null;
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
      const result = await refreshStatus();
      if (!result) {
        setTestOk(false);
        setTestMessage("Could not reach the app to check storage.");
        return;
      }

      if (result.configured) {
        setTestOk(true);
        setTestMessage("Connected — Spaces credentials are configured.");
        return;
      }

      setTestOk(false);
      setTestMessage(
        result.reason ??
          "Object storage is not configured. Set Spaces credentials on the API deployment.",
      );
    } catch (error) {
      setTestOk(false);
      setTestMessage(
        error instanceof Error ? error.message : "Storage connection test failed",
      );
    } finally {
      setTesting(false);
    }
  }

  const connected = status?.configured ?? false;

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
          Letter PDFs and document content are stored in the deployment&apos;s
          DigitalOcean Spaces bucket. Credentials are configured on the API —
          BacksterOS does not store Spaces secrets in the app.
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
            <dt>Provider</dt>
            <dd>DigitalOcean Spaces</dd>
          </div>
        </dl>

        {status && !connected && status.reason ? (
          <p className="settings-hint">{status.reason}</p>
        ) : null}

        {status?.configured ? (
          <p className="settings-hint">
            Credentials are present. Use Test connection to re-check status with
            the API.
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
