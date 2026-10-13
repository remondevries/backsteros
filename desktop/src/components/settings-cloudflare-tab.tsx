import { useCallback, useEffect, useState } from "react";
import type {
  CloudflareSettings,
  CloudflareTestConnectionResult,
} from "@backsteros/contracts";
import { IntegrationConnectionSettingsView } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

export function SettingsCloudflareTab({
  title,
  description,
  hideHeader = false,
}: {
  title: string;
  description: string;
  hideHeader?: boolean;
}) {
  const { client } = useDesktopApi();
  const [settings, setSettings] = useState<CloudflareSettings | null>(null);
  const [apiTokenDraft, setApiTokenDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const body = await client.requestJson<CloudflareSettings>(
        "/api/v1/settings/cloudflare",
      );
      setSettings(body);
      setSettingsError(null);
      return body;
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Cloudflare settings.",
      );
      return null;
    }
  }, [client]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const patchSettings = async (patch: {
    apiToken?: string;
  }): Promise<CloudflareSettings | null> => {
    setSaving(true);
    setSettingsError(null);
    try {
      const body = await client.requestJson<CloudflareSettings>(
        "/api/v1/settings/cloudflare",
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
          : "Could not save Cloudflare settings.",
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
    <IntegrationConnectionSettingsView
      title={title}
      headerDescription={description}
      hideHeader={hideHeader}
      connected={settings === null ? undefined : connected}
      body={
        <>
          <p>
            Store a Cloudflare API token with Zone read (and later DNS edit)
            permissions. Catalog Domains can then match each hostname to its
            Cloudflare zone id.
          </p>
          {settingsError ? (
            <p className="settings-hint" role="alert">
              {settingsError}
            </p>
          ) : null}
          <div className="settings-field" style={{ marginTop: "1rem" }}>
            <span>API token</span>
            <input
              type="password"
              autoComplete="off"
              placeholder={
                tokenConfigured
                  ? "•••••••• (saved — paste to replace)"
                  : "Paste Cloudflare API token"
              }
              value={apiTokenDraft}
              disabled={saving}
              onChange={(event) => setApiTokenDraft(event.target.value)}
            />
          </div>
          <div className="settings-integration-actions">
            <button
              type="button"
              disabled={saving || !apiTokenDraft.trim()}
              onClick={() => {
                void onSaveToken();
              }}
            >
              {saving ? "Saving…" : "Save token"}
            </button>
            {tokenConfigured ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  void onClearToken();
                }}
              >
                Clear saved token
              </button>
            ) : null}
          </div>
          {settings?.envTokenConfigured && !tokenConfigured ? (
            <p className="settings-hint">
              Using machine env /{" "}
              <code>~/.config/secrets/cloudflare.env</code> fallback until you
              save a workspace token.
            </p>
          ) : null}
          {tokenConfigured && settings?.apiTokenPreview ? (
            <p className="settings-hint">Saved preview: {settings.apiTokenPreview}</p>
          ) : null}
        </>
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
          ? settings?.apiTokenPreview ?? "Configured"
          : settings?.envTokenConfigured
            ? "Env fallback"
            : "—"
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
              await client.requestJson<CloudflareTestConnectionResult>(
                "/api/v1/settings/cloudflare/test",
              );
            setTestOk(result.ok);
            setTestMessage(
              result.ok
                ? `Connected — ${result.zoneCount ?? 0} zone(s) visible.`
                : result.error ?? "Cloudflare connection test failed",
            );
          } catch (error) {
            setTestOk(false);
            setTestMessage(
              error instanceof Error
                ? error.message
                : "Cloudflare connection test failed",
            );
          } finally {
            setTesting(false);
          }
        })();
      }}
    />
  );
}
