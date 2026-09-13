import { useCallback, useEffect, useState } from "react";
import type {
  TransipSettings,
  TransipTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsTransipTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<TransipSettings | null>(null);
  const [apiTokenDraft, setApiTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<TransipSettings>(
        "/api/v1/settings/transip",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load TransIP settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    apiToken?: string;
  }): Promise<TransipSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<TransipSettings>(
        "/api/v1/settings/transip",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setSettings(body);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save TransIP settings.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const onSaveToken = async () => {
    const value = apiTokenDraft.trim();
    if (!value) return;
    const body = await patchSettings({ apiToken: value });
    if (body) setApiTokenDraft("");
  };

  const onClearToken = async () => {
    await patchSettings({ apiToken: "" });
    setApiTokenDraft("");
  };

  const connected = settings?.connected ?? false;
  const tokenConfigured = settings?.apiTokenConfigured ?? false;

  return (
    <>
    <IntegrationConnectionSettingsView
      title={title}
      headerDescription={description}
      hideHeader={hideHeader}
      connected={settings === null ? undefined : connected}
        body={
          <p>
            Paste a{" "}
            <a
              href="https://www.transip.eu/knowledgebase/77-using-the-transip-rest-api/"
              target="_blank"
              rel="noreferrer"
            >
              TransIP access token
            </a>{" "}
            (prefer <strong>read-only</strong>). Stored in core like
            Moneybird/GitHub — not synced via PowerSync. Env{" "}
            <code>TRANSIP_ACCESS_TOKEN</code> remains a fallback when no Settings
            token is saved.
          </p>
        }
        statusLabel={
          settings === null
            ? "Loading…"
            : connected
              ? "Connected"
              : "Not connected"
        }
        secondaryLabel="Token"
        secondaryValue={
          tokenConfigured
            ? (settings?.apiTokenPreview ?? "Configured")
            : settings?.envTokenConfigured
              ? "Env fallback only"
              : "—"
        }
        hint={
          tokenConfigured
            ? "Catalog → Domains can sync your TransIP domain inventory."
            : settings?.envTokenConfigured
              ? "Using TRANSIP_ACCESS_TOKEN from the server environment until you save a Settings token."
              : null
        }
        testing={testing}
        testMessage={testMessage}
        testOk={testOk}
        testDisabled={settings === null || !connected}
        onTestConnection={() => {
          void (async () => {
            setTesting(true);
            setTestMessage(null);
            setTestOk(null);
            try {
              const result =
                await client.requestJson<TransipTestConnectionResult>(
                  "/api/v1/settings/transip/test",
                );
              await loadSettings();
              setTestOk(result.ok);
              setTestMessage(
                result.ok
                  ? result.domainCount != null
                    ? `Connected — ${result.domainCount} domain${result.domainCount === 1 ? "" : "s"} visible.`
                    : "Connected to TransIP."
                  : (result.error ?? "TransIP connection test failed."),
              );
            } catch (error) {
              setTestOk(false);
              setTestMessage(
                error instanceof Error
                  ? error.message
                  : "TransIP connection test failed.",
              );
            } finally {
              setTesting(false);
            }
          })();
        }}
      />

      <section className="settings-card">
        <h2>Access token</h2>
        <p>
          Create a token in the TransIP control panel under API. Read-only is
          enough to list domains for Catalog.
        </p>
        <label className="settings-field">
          TransIP access token
          <input
            type="password"
            autoComplete="off"
            placeholder={
              tokenConfigured
                ? `Configured (${settings?.apiTokenPreview ?? "••••"})`
                : "Paste TransIP access token…"
            }
            value={apiTokenDraft}
            onChange={(event) => setApiTokenDraft(event.target.value)}
          />
        </label>
        <div className="settings-cursor-key-actions">
          <button
            type="button"
            disabled={saving || !apiTokenDraft.trim()}
            onClick={() => void onSaveToken()}
          >
            {saving ? "Saving…" : "Save token"}
          </button>
          <button
            type="button"
            disabled={saving || !tokenConfigured}
            onClick={() => void onClearToken()}
          >
            Clear token
          </button>
        </div>
        {tokenConfigured ? (
          <p className="settings-hint">
            Token on file: {settings?.apiTokenPreview}
          </p>
        ) : (
          <p className="settings-hint">
            No Settings token stored
            {settings?.envTokenConfigured
              ? " (env TRANSIP_ACCESS_TOKEN is still available)."
              : "."}
          </p>
        )}
        {settingsError ? (
          <p className="settings-cursor-error">{settingsError}</p>
        ) : null}
      </section>
    </>
  );
}
